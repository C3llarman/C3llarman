#!/usr/bin/env node
// Build-time script: resolves every party's roster + bench (data/parties.json)
// into the exact REAL shape public/index.html fetches at page load - real
// stats where they exist, honest zeroes where they don't (a future/empty
// week never errors, it just produces a file where nobody hasStats yet).
// One output file per party, so the site can show each visitor their own
// roster (public/index.html?party=<id>) instead of a single hardcoded one.
// Run via (writes every party in data/parties.json):
//   node scripts/flatten-player-stats.mjs --season 2026 --week 1
// Or a single party with --party <id>.
//
// Stats source: nflverse-data's "stats_player" release (built by
// nflfastR::calculate_stats()), one combined offense + defense + kicking
// file per season: stats_player_week_{season}.csv. This replaced the old
// "player_stats" release, which is frozen as of May 2025 and does not
// cover 2025 onward - do not point this script back at that release.
//
// Schedule source: data/schedule/{season}.json, produced by
// scripts/fetch-schedule.mjs - run that first for a new season.
//
// The Wall has no player-level O-line box-score data anywhere in
// nflverse, even in the combined stats file: OL rows carry identity +
// incidental stats only (rare trick-play catches, fumble recoveries,
// penalties) and nothing about blocking. Its damage input is team sacks
// allowed, derived by summing `sacks_suffered` across a team's QB rows -
// no second data source needed.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceUrl = season =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;

function parseArgs(argv) {
  const args = { seasonType: 'REG', outDir: 'data/weeks', scheduleDir: 'data/schedule', party: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--season') args.season = next();
    else if (a === '--week') args.week = next();
    else if (a === '--season-type') args.seasonType = next();
    else if (a === '--out') args.outDir = next();
    else if (a === '--schedule-dir') args.scheduleDir = next();
    else if (a === '--party') args.party = next();
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.season) throw new Error('--season is required, e.g. --season 2026');
  if (!args.week) throw new Error('--week is required, e.g. --week 1');
  args.season = Number(args.season);
  args.week = Number(args.week);
  if (!Number.isInteger(args.season)) throw new Error('--season must be an integer');
  if (!Number.isInteger(args.week)) throw new Error('--week must be an integer');
  return args;
}

// Minimal quote-aware CSV parser. nflverse CSVs are well-formed (no embedded
// newlines inside fields) but a handful of text columns can contain commas,
// so a naive split(',') is not safe.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      if (text[i - 1] !== '\r' || field.length || row.length) {
        row.push(field); field = '';
        rows.push(row); row = [];
      }
    } else if (c === '\r') {
      // skip, handled by following \n
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter(r => r.length === header.length)
    .map(r => Object.fromEntries(header.map((h, idx) => [h, r[idx]])));
}

async function fetchCsv(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${label} from ${url}: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

const num = v => (v === undefined || v === '' ? 0 : Number(v));

// "Ja'Marr Chase" / "T.J. Watt" - compare on letters/digits only so
// punctuation differences never cause a false MISSING.
const normalize = name => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function filterWeek(rows, season, week, seasonType) {
  return rows.filter(r =>
    Number(r.season) === season &&
    Number(r.week) === week &&
    r.season_type === seasonType
  );
}

// Edge rushers are split across position_group DL (DE/DT) and LB (OLB in
// a 3-4 front) - a DL-only filter silently drops real edge rushers like
// Myles Garrett... and still misses a generic-LB edge rusher like Micah
// Parsons, who nflverse tags neither DL nor OLB. Not fully fixable by
// position filtering alone; noted, not papered over.
const POSITION_FOR_SLOT = { tactician: 'QB', hunter: 'WR', rogue: 'RB', mender: 'K' };

function findRow(rows, slot, name, team) {
  const target = normalize(name);
  if (!target) return null;
  const candidates = slot === 'breaker'
    ? rows.filter(r => r.position_group === 'DL' || r.position === 'OLB')
    : rows.filter(r => r.position === POSITION_FOR_SLOT[slot]);
  return candidates.find(r => normalize(r.player_display_name) === target)
    // Fall back to the full unfiltered week if the position tag is
    // unexpected (e.g. a generic-LB edge rusher) - a name match on a
    // real player is still a real player, even off the position filter.
    || rows.find(r => normalize(r.player_display_name) === target)
    || null;
}

function statsForSlot(slot, row) {
  if (!row) {
    switch (slot) {
      case 'tactician': return { y: 0, td: 0, sk: 0 };
      case 'hunter': return { y: 0, c: 0, td: 0 };
      case 'rogue': return { y: 0, td: 0, car: 0 };
      case 'breaker': return { sk: 0, tfl: 0 };
      case 'mender': return { fg: 0, att: 0 };
    }
  }
  switch (slot) {
    case 'tactician': return { y: num(row.passing_yards), td: num(row.passing_tds), sk: num(row.sacks_suffered) };
    case 'hunter': return { y: num(row.receiving_yards), c: num(row.receptions), td: num(row.receiving_tds) };
    case 'rogue': return { y: num(row.rushing_yards), td: num(row.rushing_tds), car: num(row.carries) };
    case 'breaker': return { sk: num(row.def_sacks), tfl: num(row.def_tackles_for_loss) };
    case 'mender': return { fg: num(row.fg_made), att: num(row.fg_att) };
  }
}

// parties.json is free to use whatever team code someone typed (e.g. the
// common "LAR" for the Rams) - nflverse's own stats CSV and schedule
// consistently use "LA". Canonicalize before any lookup rather than
// editing parties.json to match nflverse's convention.
const TEAM_ALIASES = { LAR: 'LA', JAC: 'JAX', WSH: 'WAS' };
const canonicalTeam = team => TEAM_ALIASES[team] || team;

function scheduleFor(schedule, week, team) {
  const entry = schedule?.weeks?.[String(week)]?.[canonicalTeam(team)];
  if (!entry) return { opponent: null, homeAway: null, kickoff: null };
  return entry;
}

function resolveEntry(slot, roster, rows, schedule, week) {
  const rosterTeam = canonicalTeam(roster.team);
  const row = slot === 'wall' ? null : findRow(rows, slot, roster.name, rosterTeam);
  const team = row ? row.team : rosterTeam;
  const sched = scheduleFor(schedule, week, team);
  const base = { team, ...sched };
  if (slot !== 'wall') base.name = roster.name;
  return { ...base, ...statsForSlot(slot, row), hasStats: !!row };
}

function resolveWall(roster, rows, schedule, week) {
  const team = canonicalTeam(roster.team);
  const teamRows = rows.filter(r => r.position === 'QB' && r.team === team);
  const sacksAllowed = teamRows.reduce((sum, r) => sum + num(r.sacks_suffered), 0);
  const sched = scheduleFor(schedule, week, team);
  return { team, sacksAllowed, hasStats: teamRows.length > 0, ...sched };
}

// The roster locks at the EARLIEST real kickoff among its six starters -
// standard "can't see how your Thursday guy did before setting Sunday's
// lineup" fantasy behavior. Derived from the real schedule, never
// hand-typed, so it can't drift out of sync with the games actually being
// played (a hand-typed date already had: a lock time on a day with no
// game in it at all).
function lockedAtFor(real) {
  const kickoffs = Object.values(real).map(slot => slot.kickoff).filter(Boolean);
  if (!kickoffs.length) return null;
  return kickoffs.reduce((min, k) => (new Date(k) < new Date(min) ? k : min));
}

async function main() {
  const { season, week, seasonType, outDir, scheduleDir, party: partyId } = parseArgs(process.argv.slice(2));

  const partiesPath = path.join(ROOT, 'data', 'parties.json');
  const partiesDoc = JSON.parse(await readFile(partiesPath, 'utf8'));
  // No --party: every party in the file gets its own output. The site
  // shows one party per visitor via ?party=<id>, so all of them need to
  // exist - not just whichever one used to be "first".
  const parties = partyId
    ? [partiesDoc.parties.find(p => p.id === partyId)]
    : partiesDoc.parties;
  if (!parties[0]) throw new Error(`Party "${partyId}" not found in ${partiesPath}`);

  const schedulePath = path.join(ROOT, scheduleDir, `${season}.json`);
  let schedule = null;
  try {
    schedule = JSON.parse(await readFile(schedulePath, 'utf8'));
  } catch {
    console.log(`No schedule at ${schedulePath} - run scripts/fetch-schedule.mjs first. Continuing with kickoff=null.`);
  }

  const url = sourceUrl(season);
  console.log(`Fetching nflverse player stats for season=${season} week=${week} (${seasonType})...`);
  console.log(`  ${url}`);
  let allRows = [];
  try {
    allRows = await fetchCsv(url, 'stats_player');
  } catch (err) {
    // A season with no games played yet may not have this file at all
    // (404), not just zero rows within it - either way, that's the
    // expected shape of "nothing has happened yet", not a build failure.
    console.log(`${err.message} - treating as zero rows (season/week not played yet).`);
  }
  const rows = filterWeek(allRows, season, week, seasonType);
  console.log(`${rows.length} rows found for season=${season} week=${week}` +
    (rows.length === 0 ? ' - writing empty stat lines for every roster entry, not erroring.' : '.'));

  const SWAPPABLE = ['tactician', 'rogue', 'hunter'];
  const weekStr = String(week).padStart(2, '0');
  const dir = path.join(outDir, String(season), `week-${weekStr}`);
  await mkdir(dir, { recursive: true });

  for (const party of parties) {
    const real = {};
    for (const [slot, rosterEntry] of Object.entries(party.roster)) {
      real[slot] = slot === 'wall'
        ? resolveWall(rosterEntry, rows, schedule, week)
        : resolveEntry(slot, rosterEntry, rows, schedule, week);
      if (SWAPPABLE.includes(slot) && party.bench?.[slot]) {
        real[slot].bench = [resolveEntry(slot, party.bench[slot], rows, schedule, week)];
      }
    }

    const output = {
      season,
      week,
      seasonType,
      generatedAt: new Date().toISOString(),
      source: url,
      scheduleSource: schedule ? schedulePath : null,
      party: { id: party.id, name: party.name },
      lockedAt: lockedAtFor(real),
      ...real,
    };

    const file = path.join(dir, `${party.id}.json`);
    await writeFile(file, JSON.stringify(output, null, 2) + '\n');

    const hasStatsCount = ['tactician', 'hunter', 'rogue', 'breaker', 'mender', 'wall']
      .filter(slot => real[slot]?.hasStats).length;
    console.log(`Wrote ${file}`);
    console.log(`  party=${party.name}  rows=${rows.length}  slots with real stats: ${hasStatsCount}/6  lockedAt=${output.lockedAt}`);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
