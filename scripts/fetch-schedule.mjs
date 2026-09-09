#!/usr/bin/env node
// Build-time script: pulls one season's real NFL schedule and writes a
// compact per-team-per-week JSON so flatten-player-stats.mjs can join
// kickoff/opponent/home-away onto every roster and bench entry without a
// runtime fetch.
//
// Source: nflverse-data's "schedules" release (games.csv) - the same
// nflverse-data GitHub release family used everywhere else in this repo.
// Verified before use: the 2026 season is present (272 REG rows across
// all 18 weeks) and `gametime` matches the standard NFL broadcast slots
// (13:00, 16:25, 20:20, 20:15) for teams across every time zone, which is
// only possible if `gametime` is US/Eastern local time - so that's the
// timezone this script assumes when building each kickoff's ISO offset.
//
// Run via: node scripts/fetch-schedule.mjs [--season 2026]

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SCHEDULE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';

function parseArgs(argv) {
  const args = { season: 2026, outDir: 'data/schedule' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--season') args.season = Number(next());
    else if (a === '--out') args.outDir = next();
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isInteger(args.season)) throw new Error('--season must be an integer');
  return args;
}

// Same minimal quote-aware CSV parser as flatten-player-stats.mjs.
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

// `gameday` + `gametime` are US/Eastern local, with no offset of their
// own - derive the correct DST-aware offset for that specific date via
// Intl rather than hardcoding -04:00/-05:00 and getting it wrong across
// the November DST boundary.
function easternOffset(gameday) {
  const noonUtc = new Date(`${gameday}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', timeZoneName: 'shortOffset',
  }).formatToParts(noonUtc);
  const tzName = parts.find(p => p.type === 'timeZoneName').value; // "GMT-4" or "GMT-5"
  const hours = Number(tzName.replace('GMT', '')) || -5;
  const sign = hours < 0 ? '-' : '+';
  return `${sign}${String(Math.abs(hours)).padStart(2, '0')}:00`;
}

function toIsoKickoff(gameday, gametime) {
  if (!gameday || !gametime) return null;
  return `${gameday}T${gametime}:00${easternOffset(gameday)}`;
}

async function main() {
  const { season, outDir } = parseArgs(process.argv.slice(2));

  console.log(`Fetching ${SCHEDULE_URL} ...`);
  const res = await fetch(SCHEDULE_URL);
  if (!res.ok) throw new Error(`Failed to fetch schedule: HTTP ${res.status}`);
  const rows = parseCsv(await res.text());

  const games = rows.filter(r => Number(r.season) === season && r.game_type === 'REG');
  if (games.length === 0) {
    console.log(`No REG season games found for season=${season}. Writing an empty schedule.`);
  }

  const weeks = {};
  for (const g of games) {
    const week = String(Number(g.week));
    const kickoff = toIsoKickoff(g.gameday, g.gametime);
    weeks[week] = weeks[week] || {};
    weeks[week][g.home_team] = { opponent: g.away_team, homeAway: 'home', kickoff };
    weeks[week][g.away_team] = { opponent: g.home_team, homeAway: 'away', kickoff };
  }

  const output = {
    season,
    generatedAt: new Date().toISOString(),
    source: SCHEDULE_URL,
    weeks,
  };

  const dir = outDir;
  const file = path.join(dir, `${season}.json`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(output, null, 2) + '\n');

  const weekCount = Object.keys(weeks).length;
  console.log(`Wrote ${file}`);
  console.log(`  ${games.length} games across ${weekCount} weeks.`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
