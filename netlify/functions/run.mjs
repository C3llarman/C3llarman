// Persists this week's run - arrivals landed, cards committed, room/party
// HP - server-side (Netlify Blobs), the same problem subs.mjs solved for
// substitutions but for the run itself. public/index.html's buildParty()
// resets every slot to full HP and 'traveling' on every page load, so
// without this a reload mid-run (not just an interrupted one - ANY reload
// before the floor resolved) silently threw away every arrival and every
// committed card, and a finished result only ever showed up again on the
// one browser that produced it.
//
// Same identity model as subs.mjs: no accounts, the party id in the URL
// is what the rest of the app already treats as identity.
import { getStore } from '@netlify/blobs';

const STATES = ['traveling', 'arrived', 'spent'];

function cleanRun(body) {
  if (!body || typeof body !== 'object') return null;
  const { arrivalIdx, roomHp, soldiers, bossHp, hp, state, done } = body;
  if (!Number.isInteger(arrivalIdx) || arrivalIdx < 0 || arrivalIdx > 6) return null;
  if (typeof roomHp !== 'number' || !Number.isFinite(roomHp)) return null;
  // soldiers/bossHp - the Horde Mother's pool (formulas.js) - ride along
  // unconditionally, same shape whichever floor mechanic is actually
  // live client-side, so this validator never has to branch per floor.
  if (typeof soldiers !== 'number' || !Number.isFinite(soldiers)) return null;
  if (typeof bossHp !== 'number' || !Number.isFinite(bossHp)) return null;
  if (!Array.isArray(hp) || hp.length !== 6 || !hp.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (!Array.isArray(state) || state.length !== 6 || !state.every((s) => STATES.includes(s))) return null;
  if (typeof done !== 'boolean') return null;
  return { arrivalIdx, roomHp, soldiers, bossHp, hp, state, done };
}

export default async (req) => {
  const url = new URL(req.url);
  const party = url.searchParams.get('party');
  const season = url.searchParams.get('season');
  const week = url.searchParams.get('week');
  if (!party || !season || !week) {
    return new Response(JSON.stringify({ error: 'party, season, and week are required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Same key shape as subs.mjs, same store family - a different store
  // ('runstate') so a bad write to one can never clobber the other.
  const key = `${season}:${week}:${party}`;
  const store = getStore('runstate');

  if (req.method === 'GET') {
    const data = await store.get(key, { type: 'json' });
    return new Response(JSON.stringify(data || null), {
      headers: { 'content-type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    const clean = cleanRun(body);
    if (!clean) {
      return new Response(JSON.stringify({ error: 'invalid run payload' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    await store.setJSON(key, clean);
    return new Response(JSON.stringify(clean), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // "Start the run over" needs to actually clear the checkpoint, not just
  // reload into it again - see the reset handler in public/index.html.
  if (req.method === 'DELETE') {
    await store.delete(key);
    return new Response(null, { status: 204 });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/api/run' };
