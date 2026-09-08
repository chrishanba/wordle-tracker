// api/state.js — shared storage for the Wordle head-to-head tracker.
// Works with an Upstash Redis database connected through Vercel
// (env vars are injected automatically when you connect it).

const REDIS_KEY = 'wh2h:state';

function creds() {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(command) {
  const c = creds();
  if (!c) throw new Error('no-db');
  const r = await fetch(c.url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + c.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('redis-' + r.status);
  const data = await r.json();
  return data.result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const raw = await redis(['GET', REDIS_KEY]);
      res.status(200).json(raw ? JSON.parse(raw) : null);
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      if (!body || !Array.isArray(body.games)) {
        res.status(400).json({ error: 'That does not look like scoreboard data.' });
        return;
      }
      body.updatedAt = Date.now();
      await redis(['SET', REDIS_KEY, JSON.stringify(body)]);
      res.status(200).json({ ok: true, updatedAt: body.updatedAt });
      return;
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    const msg =
      e.message === 'no-db'
        ? 'Storage is not connected yet. In Vercel: Storage tab, create an Upstash Redis database, connect it to this project, then redeploy.'
        : 'Server error — try again in a moment.';
    res.status(500).json({ error: msg });
  }
};
