#!/usr/bin/env node
// Build-time script: advances the season by one week, but only once the
// outgoing week is genuinely over. Meant to be run unattended (e.g. from
// the existing stats-refresh routine) - safe to call any time, since it's
// a no-op, not an error, whenever the current week isn't done yet.
//
// "Over" means every game scheduled that week kicked off long enough ago
// that nflverse should have ingested it (CLAUDE.md: play completed
// weeks, not live ones) - the same 6-hour past-kickoff buffer
// public/index.html's isInactive() uses, checked against the LATEST
// kickoff across the whole week's schedule, not just the 18 rostered
// starters. Deliberately not "does every rostered slot have stats" - a
// slot can be genuinely done for the week (inactive, bye, IR) with real,
// final, zero stats forever, which is exactly the bug this would
// reintroduce if used as the gate instead.
//
// On advancing, in order: refreshes the outgoing week's stats one more
// time (so season-state is computed from its most final numbers), runs
// compute-season-state.mjs to carry Floor I's HP forward, bumps
// data/current-week.json, then flattens the new week (mostly future/
// empty at first - the stats-refresh routine keeps it current from
// there).
//
// Run via: node scripts/advance-week.mjs [--season 2026] [--force]
// --force skips the over-buffer check - for manual testing only, never
// for the automated routine.

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GAME_OVER_BUFFER_MS = 6 * 60 * 60 * 1000;
const LAST_REGULAR_SEASON_WEEK = 18;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--season') args.season = Number(next());
    else if (a === '--force') args.force = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cw = JSON.parse(await readFile(path.join(ROOT, 'data/current-week.json'), 'utf8'));
  const season = args.season || cw.season;
  const week = cw.week;

  if (week >= LAST_REGULAR_SEASON_WEEK) {
    console.log(`Season ${season} is already at week ${week} (the last regular-season week) - nothing to advance to.`);
    return;
  }

  const schedule = JSON.parse(await readFile(path.join(ROOT, 'data/schedule', `${season}.json`), 'utf8'));
  const weekGames = schedule.weeks[String(week)];
  if (!weekGames) throw new Error(`No schedule entry for season ${season} week ${week}`);
  const lastKickoff = Math.max(...Object.values(weekGames).map(g => new Date(g.kickoff).getTime()));

  if (!args.force && Date.now() < lastKickoff + GAME_OVER_BUFFER_MS) {
    console.log(`Week ${week}'s last kickoff (${new Date(lastKickoff).toISOString()}) hasn't cleared the ${GAME_OVER_BUFFER_MS / 3600000}h over-buffer yet - not advancing.`);
    return;
  }

  console.log(`Week ${week} is over - refreshing its final stats, computing season-state, and advancing to week ${week + 1}.`);

  execFileSync('node', ['scripts/flatten-player-stats.mjs', '--season', String(season), '--week', String(week)], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('node', ['scripts/compute-season-state.mjs', '--season', String(season), '--through-week', String(week)], { cwd: ROOT, stdio: 'inherit' });

  await writeFile(path.join(ROOT, 'data/current-week.json'), JSON.stringify({ season, week: week + 1 }, null, 2) + '\n');
  console.log(`Advanced data/current-week.json to week ${week + 1}.`);

  execFileSync('node', ['scripts/flatten-player-stats.mjs', '--season', String(season), '--week', String(week + 1)], { cwd: ROOT, stdio: 'inherit' });

  console.log(`Done. Now on season ${season} week ${week + 1}.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
