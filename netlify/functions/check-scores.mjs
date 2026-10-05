// The "check for new scores" button on the Week tab. Stats only ever reach
// the site through .github/workflows/refresh.yml (hourly cron: flatten from
// nflverse, commit data/, Netlify deploys). GitHub's cron is best-effort -
// runs get delayed or dropped - so this lets anyone with the page kick that
// same workflow by hand, but only when no successful check has run in the
// last CHECK_EVERY_MS. The workflow is the one rate limit: the hourly cron
// counts as a check, and so does a run someone else's tap started.
//
// GET  -> state of the latest check, never starts one (the page polls this).
// POST -> same, but starts a check first if the last good one is stale.
//
// Needs two Netlify env vars (Functions scope):
//   HFF_GITHUB_TOKEN  fine-grained PAT, this repo only, "Actions: read and write"
//   HFF_GITHUB_REPO   optional, defaults to C3llarman/C3llarman
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
const WORKFLOW = 'refresh.yml';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const token = process.env.HFF_GITHUB_TOKEN;
  const repo = process.env.HFF_GITHUB_REPO || 'C3llarman/C3llarman';
  if (!token) return json({ error: 'not configured' }, 503);

  const gh = (path, init = {}) => fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'high-fantasy-football',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });

  const runsRes = await gh('/runs?per_page=20');
  if (!runsRes.ok) return json({ error: `GitHub ${runsRes.status}` }, 502);
  const { workflow_runs: runs = [] } = await runsRes.json();
  // A failed run didn't check anything, so it doesn't reset the clock.
  const running = runs.find((r) => r.status !== 'completed');
  const lastGood = runs.find((r) => r.status === 'completed' && r.conclusion === 'success');
  const lastCheck = lastGood ? lastGood.updated_at : null;
  const state = { running: !!running, lastCheck, checkEveryMs: CHECK_EVERY_MS, started: false };

  if (req.method === 'GET' || running) return json(state);
  if (lastCheck && Date.now() - new Date(lastCheck).getTime() < CHECK_EVERY_MS) return json(state);

  const dispatch = await gh('/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
  if (!dispatch.ok) return json({ ...state, error: `GitHub ${dispatch.status}` }, 502);
  return json({ ...state, running: true, started: true });
};

export const config = { path: '/api/check-scores' };
