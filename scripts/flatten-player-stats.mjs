#!/usr/bin/env node
// Build-time script: pulls one week of real nflverse player stats and flattens
// it into the compact per-week JSON the app reads. Run via:
//   node scripts/flatten-player-stats.mjs --season 2025 --week 1
//
// Source: nflverse-data's "stats_player" release (built by nflfastR::calculate_stats()),
// one combined offense + defense + kicking file per season:
//   stats_player_week_{season}.csv
//
// This replaced the old "player_stats" release (player_stats.csv / _def.csv /
// _kicking.csv), which is frozen as of May 2025 and does not cover the 2025
// season onward. Do not point this script back at that release.
//
// The Wall has no player-level O-line box-score data anywhere in nflverse, even
// in this combined file: OL rows here carry identity + incidental stats only
// (rare trick-play catches, fumble recoveries, penalties) and nothing about
// blocking. Its damage input is team sacks allowed, derived by summing
// `sacks_suffered` across a team's QB rows — no second data source needed.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourceUrl = season =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;

function parseArgs(argv) {
  const args = { seasonType: 'REG', outDir: 'data/weeks' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--season') args.season = next();
    else if (a === '--week') args.week = next();
    else if (a === '--season-type') args.seasonType = next();
    else if (a === '--out') args.outDir = next();
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.season) throw new Error('--season is required, e.g. --season 2025');
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
  const text = await res.text();
  return parseCsv(text);
}

const num = v => (v === undefined || v === '' ? 0 : Number(v));

function filterWeek(rows, season, week, seasonType) {
  return rows.filter(r =>
    Number(r.season) === season &&
    Number(r.week) === week &&
    r.season_type === seasonType
  );
}

function buildWallByTeam(rows) {
  const wall = {};
  for (const r of rows) {
    if (r.position !== 'QB') continue;
    const team = r.team;
    if (!team) continue;
    wall[team] = wall[team] || { team, sacksAllowed: 0 };
    wall[team].sacksAllowed += num(r.sacks_suffered);
  }
  return wall;
}

function buildPlayers(rows) {
  const tactician = rows
    .filter(r => r.position === 'QB')
    .map(r => ({
      playerId: r.player_id,
      name: r.player_display_name,
      team: r.team,
      opponent: r.opponent_team,
      passYds: num(r.passing_yards),
      passTd: num(r.passing_tds),
      sacksTaken: num(r.sacks_suffered),
    }));

  const hunter = rows
    .filter(r => r.position === 'WR')
    .map(r => ({
      playerId: r.player_id,
      name: r.player_display_name,
      team: r.team,
      opponent: r.opponent_team,
      recYds: num(r.receiving_yards),
      receptions: num(r.receptions),
    }));

  const rogue = rows
    .filter(r => r.position === 'RB')
    .map(r => ({
      playerId: r.player_id,
      name: r.player_display_name,
      team: r.team,
      opponent: r.opponent_team,
      rushYds: num(r.rushing_yards),
      rushTd: num(r.rushing_tds),
      carries: num(r.carries),
    }));

  // Edge rushers are split across position_group DL (DE/DT) and LB (OLB in a
  // 3-4 front) - a DL-only filter silently drops real edge rushers like
  // Micah Parsons and T.J. Watt, who nflverse lists under LB/OLB.
  const breaker = rows
    .filter(r => r.position_group === 'DL' || r.position === 'OLB')
    .map(r => ({
      playerId: r.player_id,
      name: r.player_display_name,
      team: r.team,
      sacks: num(r.def_sacks),
      tfl: num(r.def_tackles_for_loss),
    }));

  const mender = rows
    .filter(r => r.position === 'K')
    .map(r => ({
      playerId: r.player_id,
      name: r.player_display_name,
      team: r.team,
      fgMade: num(r.fg_made),
      fgAtt: num(r.fg_att),
    }));

  return { tactician, hunter, rogue, breaker, mender };
}

async function main() {
  const { season, week, seasonType, outDir } = parseArgs(process.argv.slice(2));
  const url = sourceUrl(season);

  console.log(`Fetching nflverse player stats for season=${season} week=${week} (${seasonType})...`);
  console.log(`  ${url}`);
  const allRows = await fetchCsv(url, 'stats_player');
  const rows = filterWeek(allRows, season, week, seasonType);

  if (rows.length === 0) {
    throw new Error(
      `No rows found for season=${season} week=${week} season_type=${seasonType} in ${url}. ` +
      `The nflverse release may not have this week's data yet, or the season/week is wrong.`
    );
  }

  const players = buildPlayers(rows);
  const wall = buildWallByTeam(rows);

  const output = {
    season,
    week,
    seasonType,
    generatedAt: new Date().toISOString(),
    source: url,
    counts: {
      tactician: players.tactician.length,
      hunter: players.hunter.length,
      rogue: players.rogue.length,
      breaker: players.breaker.length,
      mender: players.mender.length,
    },
    wall,
    players,
  };

  const weekStr = String(week).padStart(2, '0');
  const dir = path.join(outDir, String(season));
  const file = path.join(dir, `week-${weekStr}.json`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(output, null, 2) + '\n');

  console.log(`Wrote ${file}`);
  console.log(`  tactician=${players.tactician.length} hunter=${players.hunter.length} ` +
    `rogue=${players.rogue.length} breaker=${players.breaker.length} mender=${players.mender.length} ` +
    `teams(wall)=${Object.keys(wall).length}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
