// The Week tab's "Check for scores" button. Stats normally reach the site
// through .github/workflows/refresh.yml (hourly: flatten from nflverse,
// commit data/, Netlify deploys), but GitHub's cron is best-effort. This
// runs the same flatten itself - flattenWeek() from
// scripts/flatten-player-stats.mjs, same nflverse files, same output shape -
// and keeps the result in Netlify Blobs. No GitHub token, no commit, no
// deploy. public/index.html loads whichever is newer: the committed week
// file or the copy here (by generatedAt).
//
// At most one real check per CHECK_EVERY_MS across the whole guild: a check
// flattens every party at once, so one person's tap freshens everyone's.
//
// GET  ?party&season&week -> { checkedAt, data } stored for that party (data may be null)
// POST ?party             -> same, after running a check if the last is stale
import { getStore } from '@netlify/blobs';
import { flattenWeek } from '../../scripts/flatten-player-stats.mjs';

const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default async (req) => {
  const url = new URL(req.url);
  const party = url.searchParams.get('party');
  if (!party) return json({ error: 'party is required' }, 400);
  const store = getStore('scores');
  const last = await store.get('last', { type: 'json' });
  const base = { checkedAt: last ? last.checkedAt : null, checkEveryMs: CHECK_EVERY_MS };

  if (req.method === 'GET') {
    const season = url.searchParams.get('season');
    const week = url.searchParams.get('week');
    if (!season || !week) return json({ error: 'season and week are required' }, 400);
    return json({ ...base, data: await store.get(`${season}:${week}:${party}`, { type: 'json' }) });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Which week, which rosters, which schedule: the deployed copies of data/.
  const site = (p) => fetch(new URL(p, url.origin)).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${p}`);
    return r.json();
  });
  const { season, week } = await site('/data/current-week.json');
  const key = `${season}:${week}:${party}`;

  if (last && last.season === season && last.week === week
      && Date.now() - new Date(last.checkedAt).getTime() < CHECK_EVERY_MS) {
    return json({ ...base, checked: false, data: await store.get(key, { type: 'json' }) });
  }

  try {
    const { parties } = await site('/data/parties.json');
    const schedulePath = `data/schedule/${season}.json`;
    const schedule = await site(`/${schedulePath}`).catch(() => null);
    const outputs = await flattenWeek({
      season, week, parties, schedule, scheduleSource: schedule ? schedulePath : null,
    });
    await Promise.all(Object.entries(outputs).map(([id, out]) => store.setJSON(`${season}:${week}:${id}`, out)));
    const checkedAt = new Date().toISOString();
    await store.setJSON('last', { checkedAt, season, week });
    return json({ checkedAt, checkEveryMs: CHECK_EVERY_MS, checked: true, data: outputs[party] || null });
  } catch (err) {
    return json({ ...base, error: err.message }, 502);
  }
};

export const config = { path: '/api/check-scores' };
