// Persists one party's current substitution choice server-side (Netlify
// Blobs) so it shows up the same regardless of which device/browser opens
// the party's link - localStorage alone (public/index.html's fallback)
// only ever lived on whichever one device made the swap.
//
// No accounts: the party id in the URL is the same identity model the
// rest of the app already uses (whoever has the link can act as that
// party) - this doesn't expand that trust model, just moves the same
// data to a shared place. Deliberately not the rest of "Guild"
// (CLAUDE.md defers accounts/leaderboard) - this is only the one piece
// that was actually broken: a choice not surviving a different device.
import { getStore } from '@netlify/blobs';

// Matches SWAPPABLE in public/index.html exactly - the only slots that
// ever have a bench to swap from.
const SWAPPABLE = ['tactician', 'rogue', 'hunter'];

function cleanSubs(body) {
  const out = {};
  if (body && typeof body === 'object') {
    for (const slot of SWAPPABLE) {
      if (typeof body[slot] === 'boolean') out[slot] = body[slot];
    }
  }
  return out;
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
  // Same key shape as the localStorage fallback (hff:subs:{season}:{week}:{party})
  // so the two stay easy to reason about side by side.
  const key = `${season}:${week}:${party}`;
  const store = getStore('subs');

  if (req.method === 'GET') {
    const data = await store.get(key, { type: 'json' });
    return new Response(JSON.stringify(data || {}), {
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
    const clean = cleanSubs(body);
    await store.setJSON(key, clean);
    return new Response(JSON.stringify(clean), {
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/api/subs' };
