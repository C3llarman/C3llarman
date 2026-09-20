#!/usr/bin/env node
// Build-time script: replays every party's already-committed weeks
// against whichever floor they're actually on, using the exact same
// damage/HP formulas public/index.html uses live (public/formulas.js -
// CLAUDE.md: "Formulas live in one place, not duplicated"), and writes
// the result each party should START the next week at - the current
// floor's own pool (room HP for a yards-damage floor, soldiers/boss HP
// for a Horde Mother-style floor), and each party member's HP after
// that week's attrition and the 15%/week off-week recovery (CLAUDE.md,
// decided).
//
// Floor advancement happens on week boundaries only, never mid-week: if
// a floor clears from a given week's damage, the NEXT week starts fresh
// on the NEXT floor (its own maxHp/boss HP - CLAUDE.md: "overkill
// doesn't carry to the next floor"), never the same week splashing
// leftover damage into what comes after it.
//
// Only run this for weeks that have actually finished (CLAUDE.md: "Play
// completed weeks, not live ones") - it has no way to tell a bye/inactive
// slot apart from a game that just hasn't been flattened into
// data/weeks/ yet, and will happily (wrongly) treat the latter as a
// no-stats week too.
//
// Run before advancing data/current-week.json, so the week you're
// advancing INTO has a season-state entry waiting for it:
//   node scripts/compute-season-state.mjs --season 2026 --through-week 1

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_HP, resolveDrive, applyDrive, regenHp, resolveHordeMotherWeek } from '../public/formulas.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const args = { outFile: 'data/season-state.json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--season') args.season = Number(next());
    else if (a === '--through-week') args.throughWeek = Number(next());
    else if (a === '--out') args.outFile = next();
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.season) throw new Error('--season is required, e.g. --season 2026');
  if (!args.throughWeek) throw new Error('--through-week is required, e.g. --through-week 1');
  return args;
}

// Canonical drive-resolution order - matches ARRIVAL_ORDER in
// public/index.html (wall, tactician, hunter, rogue, breaker, mender).
// Only matters for the Wall's soak, which is capped by whatever Wall HP
// remains at the moment each drive resolves - a different order could
// leave a different member more or less worn down for the same week.
const DRIVE_ORDER = ['wall', 'tactician', 'hunter', 'rogue', 'breaker', 'mender'];

function freshFloorPool(floor) {
  return floor.mechanic === 'horde-mother' ? { soldiers: 0, bossHp: floor.maxHp } : { roomHp: floor.maxHp };
}

function isFloorCleared(floor, pool) {
  return floor.mechanic === 'horde-mother' ? pool.bossHp <= 0 : pool.roomHp <= 0;
}

// Party HP attrition/heal (sacks taken, carries taken, the Wall's soak,
// the Mender's heal) is real physical wear from that week's games - it
// applies no matter which encounter that week's damage is being measured
// against, so it runs every week regardless of the current floor's
// mechanic. Only the FLOOR's own pool (room HP, or soldiers/boss HP)
// depends on which kind of floor is live.
function applyWeekToParty(hp, weekData, floor) {
  let next = { ...hp };
  for (const slot of DRIVE_ORDER) {
    const r = weekData[slot];
    if (!r || !r.hasStats) continue;
    const result = resolveDrive(slot, r, floor.mechanic);
    // roomHp threaded through as 0 and discarded here on purpose - this
    // call is only for its hp side effects (soak/take/heal/clamp) below;
    // the floor's own pool (if this is a yards-damage floor) is tracked
    // separately in applyWeekToFloor so a Horde Mother-style floor,
    // which has no yards-damage pool at all, can skip it cleanly.
    next = applyDrive(next, 0, slot, result).hp;
  }
  return next;
}

function applyWeekToFloor(floor, pool, weekData) {
  if (floor.mechanic === 'horde-mother') {
    return resolveHordeMotherWeek(pool, weekData);
  }
  let roomHp = pool.roomHp;
  for (const slot of DRIVE_ORDER) {
    const r = weekData[slot];
    if (!r || !r.hasStats) continue;
    const result = resolveDrive(slot, r, floor.mechanic);
    roomHp -= result.dmg;
  }
  return { roomHp };
}

async function replayParty(partyId, season, throughWeek, floors) {
  let floorIdx = 0;
  let pool = freshFloorPool(floors[floorIdx]);
  let hp = { ...MAX_HP };
  let weeksOnFloor = 0;
  let totalWeeksPlayed = 0;

  for (let week = 1; week <= throughWeek; week++) {
    if (floorIdx >= floors.length) {
      console.warn(`${partyId}: cleared every floor in data/floors.json before week ${week} - nothing left to replay against. Stopping.`);
      break;
    }
    const floor = floors[floorIdx];
    const weekStr = String(week).padStart(2, '0');
    const file = path.join(ROOT, 'data', 'weeks', String(season), `week-${weekStr}`, `${partyId}.json`);
    let weekData;
    try {
      weekData = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      console.warn(`${partyId}: no data for week ${week} (${file}) - skipping.`);
      continue;
    }
    totalWeeksPlayed++;
    weeksOnFloor++;

    hp = applyWeekToParty(hp, weekData, floor);
    pool = applyWeekToFloor(floor, pool, weekData);

    if (isFloorCleared(floor, pool)) {
      console.log(`${partyId}: cleared Floor ${floor.id} (${floor.name}) after week ${week}.`);
      floorIdx++;
      weeksOnFloor = 0;
      if (floorIdx < floors.length) pool = freshFloorPool(floors[floorIdx]);
      // Party HP still gets its off-week recovery even on the week a
      // floor falls - it's recovery between real weeks, not a floor
      // reward, and the next floor (if any) starts next week either way.
      hp = regenHp(hp);
    } else {
      hp = regenHp(hp);
    }
  }

  const clearedAllFloors = floorIdx >= floors.length;
  const floor = clearedAllFloors ? floors[floors.length - 1] : floors[floorIdx];
  return {
    floorId: floor.id,
    cleared: clearedAllFloors,
    ...pool,
    hp,
    weeksOnFloor,
    totalWeeksPlayed,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const partiesFile = JSON.parse(await readFile(path.join(ROOT, 'data/parties.json'), 'utf8'));
  const floors = JSON.parse(await readFile(path.join(ROOT, 'data/floors.json'), 'utf8')).sort((a, b) => a.id - b.id);
  if (!floors.length) throw new Error('data/floors.json has no floors');

  const out = {
    season: args.season,
    computedThroughWeek: args.throughWeek,
    generatedAt: new Date().toISOString(),
    parties: {},
  };

  for (const party of partiesFile.parties) {
    out.parties[party.id] = await replayParty(party.id, args.season, args.throughWeek, floors);
  }

  const outPath = path.join(ROOT, args.outFile);
  await writeFile(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
  for (const [id, s] of Object.entries(out.parties)) {
    const floor = floors.find(f => f.id === s.floorId);
    const poolText = 'roomHp' in s ? `roomHp ${s.roomHp}/${floor.maxHp}` : `boss HP ${s.bossHp}/${floor.maxHp}, ${s.soldiers} soldier${s.soldiers === 1 ? '' : 's'} standing`;
    console.log(`  ${id}: Floor ${s.floorId} (${floor.name}) - ${poolText}${s.cleared ? ' (SEASON CLEARED)' : ''}, ${s.weeksOnFloor} week${s.weeksOnFloor === 1 ? '' : 's'} on this floor, ${s.totalWeeksPlayed} played total`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
