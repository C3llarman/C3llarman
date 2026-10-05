#!/usr/bin/env node
// Prints a Markdown note of every STARTER who probably won't score this
// week, for the scheduled refresh's run summary (GitHub Actions'
// $GITHUB_STEP_SUMMARY) - the one part of the weekly upkeep that needs a
// person: deciding who to bench. Flags:
//   - an official game status (Out / Doubtful / Questionable)
//   - no games at all this season (IR / PUP players drop off the injury
//     report entirely rather than being listed Out, so this is the tell)
// and shows that slot's bench option alongside, if the party has one.
//
// Run: node scripts/report-injuries.mjs   (reads data/current-week.json)

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SLOTS = ['tactician', 'hunter', 'rogue', 'breaker', 'mender'];
const CLASS = { tactician: 'Tactician (QB)', hunter: 'Hunter (WR)', rogue: 'Rogue (RB)', breaker: 'Breaker (EDGE)', mender: 'Mender (K)' };

function concern(r) {
  if (!r) return null;
  const s = r.injury?.status;
  if (s) return `${s}${r.injury.injury ? ` (${r.injury.injury})` : ''}`;
  if (r.form && r.form.games === 0) return 'no games yet this season (IR/PUP?)';
  return null;
}

const { season, week } = JSON.parse(await readFile(path.join(ROOT, 'data/current-week.json'), 'utf8'));
const { parties } = JSON.parse(await readFile(path.join(ROOT, 'data/parties.json'), 'utf8'));
const wk = String(week).padStart(2, '0');

const lines = [`### Week ${week} lineup check`, ''];
let flagged = 0;
for (const party of parties) {
  let real;
  try {
    real = JSON.parse(await readFile(path.join(ROOT, 'data/weeks', String(season), `week-${wk}`, `${party.id}.json`), 'utf8'));
  } catch { continue; }
  for (const slot of SLOTS) {
    const r = real[slot];
    const why = concern(r);
    if (!why) continue;
    flagged++;
    const bench = (r.bench || [])[0];
    const benchNote = bench ? ` Bench: ${bench.name}${concern(bench) ? ` (${concern(bench)})` : ''}.` : ' No bench player at this slot.';
    lines.push(`- **${party.name}**: ${CLASS[slot]} ${r.name}: ${why}.${benchNote}`);
  }
}
if (!flagged) lines.push('All starters look available.');
lines.push('', '_Testers can swap a starter for their bench player in the Tavern until their first kickoff._');
console.log(lines.join('\n'));
