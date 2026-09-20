#!/usr/bin/env node
// Build-time script: replays every party's already-committed weeks
// against the floor they're on, using the exact same damage/HP formulas
// public/index.html uses live (public/formulas.js - CLAUDE.md: "Formulas
// live in one place, not duplicated"), and writes the result each party
// should START the next week at - room HP still owed to the floor, and
// each party member's HP after that week's attrition and the 15%/week
// off-week recovery (CLAUDE.md, decided).
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
//
// v1 scope, matching what's actually wired into live gameplay: only
// Floor I. If a party's cumulative damage ever clears it mid-replay,
// this stops simulating that party right there and flags it loudly -
// floor-to-floor advance (which floor comes next, its own fresh maxHp
// per CLAUDE.md's "overkill doesn't carry") isn't built yet. That's the
// trigger for building it, not something to guess at here.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_HP, resolveDrive, applyDrive, regenHp } from '../public/formulas.js';

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

async function replayParty(partyId, season, throughWeek, floor) {
  let roomHp = floor.maxHp;
  let hp = { ...MAX_HP };
  let cleared = false;
  let weeksPlayed = 0;

  for (let week = 1; week <= throughWeek; week++) {
    if (cleared) {
      console.warn(`${partyId}: floor ${floor.id} already cleared before week ${week} - stopping replay (floor-advance isn't built yet).`);
      break;
    }
    const weekStr = String(week).padStart(2, '0');
    const file = path.join(ROOT, 'data', 'weeks', String(season), `week-${weekStr}`, `${partyId}.json`);
    let weekData;
    try {
      weekData = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      console.warn(`${partyId}: no data for week ${week} (${file}) - skipping.`);
      continue;
    }
    weeksPlayed++;
    for (const slot of DRIVE_ORDER) {
      const r = weekData[slot];
      // Never arrived (no real stats this week - inactive, bye, or a
      // still-future game caught mid-run) never gets committed, so it
      // never applies here either - matches the live app exactly.
      if (!r || !r.hasStats) continue;
      const result = resolveDrive(slot, r, floor.mechanic);
      const applied = applyDrive(hp, roomHp, slot, result);
      hp = applied.hp;
      roomHp = applied.roomHp;
    }
    if (roomHp <= 0) {
      cleared = true;
      roomHp = 0;
    } else {
      hp = regenHp(hp);
    }
  }

  return { floorId: floor.id, cleared, roomHp, hp, weeksPlayed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const partiesFile = JSON.parse(await readFile(path.join(ROOT, 'data/parties.json'), 'utf8'));
  const floors = JSON.parse(await readFile(path.join(ROOT, 'data/floors.json'), 'utf8'));
  const floor1 = floors.find(f => f.id === 1);
  if (!floor1) throw new Error('data/floors.json has no floor id 1');

  const out = {
    season: args.season,
    computedThroughWeek: args.throughWeek,
    generatedAt: new Date().toISOString(),
    parties: {},
  };

  for (const party of partiesFile.parties) {
    out.parties[party.id] = await replayParty(party.id, args.season, args.throughWeek, floor1);
  }

  const outPath = path.join(ROOT, args.outFile);
  await writeFile(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
  for (const [id, s] of Object.entries(out.parties)) {
    console.log(`  ${id}: roomHp ${s.roomHp}/${floor1.maxHp}${s.cleared ? ' (CLEARED)' : ''}, weeks played ${s.weeksPlayed}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
