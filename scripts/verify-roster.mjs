#!/usr/bin/env node
// Cross-checks data/parties.json against real nflverse stats: does each
// named player actually have a stat line somewhere in the 2025 season?
// Report only - never writes to parties.json.
//
// Source: nflverse-data's "stats_player" release (see
// scripts/flatten-player-stats.mjs for background on why this replaced
// the old "player_stats" release).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PARTIES_PATH = path.join(ROOT, 'data', 'parties.json');
const STATS_URL = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv';

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

// "Ja'Marr Chase" / "T.J. Watt" style names carry punctuation nflverse
// may or may not include - compare on letters/digits only.
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function main() {
  const parties = JSON.parse(await readFile(PARTIES_PATH, 'utf8'));

  console.log(`Fetching ${STATS_URL} ...`);
  const res = await fetch(STATS_URL);
  if (!res.ok) throw new Error(`Failed to fetch stats: HTTP ${res.status}`);
  const rows = parseCsv(await res.text());

  const known = new Set(
    rows.map(r => normalize(r.player_display_name || '')).filter(Boolean)
  );
  console.log(`Loaded ${rows.length} rows, ${known.size} distinct players, from stats_player_week_2025.csv.\n`);

  for (const party of parties.parties) {
    for (const [slot, entry] of Object.entries(party.roster)) {
      if (!entry.name) {
        console.log(`N/A     [${party.name}] ${slot}: no player name (team ${entry.team} — no O-line box score exists)`);
        continue;
      }
      const found = known.has(normalize(entry.name));
      console.log(`${found ? 'FOUND  ' : 'MISSING'} [${party.name}] ${slot}: ${entry.name} (${entry.team})`);
    }
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
