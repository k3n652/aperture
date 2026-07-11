// APERTURE backend — runs on Cloudflare Workers' free tier (100k req/day, no card).
// Two jobs:
//   1. Proxy TMDB requests (key never reaches the browser)
//   2. Verify Cloudflare Turnstile tokens for signup (blocks scripted mass account creation)

// ---- CONFIG ----
// After deploying, replace with your real Firebase Hosting URL(s).
const ALLOWED_ORIGINS = [
  'http://localhost:5000',
  'https://YOUR-PROJECT-ID.web.app',
  'https://YOUR-PROJECT-ID.firebaseapp.com',
  // 'https://yourcustomdomain.com',
];

const RATE_LIMIT = 60;            // requests
const RATE_WINDOW_MS = 60 * 1000; // per rolling minute, per IP

// NOTE: this is a best-effort, in-memory limiter. Cloudflare runs many isolates
// at the edge, so this map is per-instance, not global — a determined attacker
// spread across edge locations could exceed the nominal limit. For stricter
// enforcement later, back this with Cloudflare KV or Durable Objects (KV's free
// tier is capped at 1,000 writes/day, which a per-request counter would burn
// through fast on real traffic, so it's not a drop-in upgrade — mentioned in
// the README as a future step, not wired up here).
const buckets = new Map();

function isAllowed(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.windowStart > RATE_WINDOW_MS) {
    b = { count: 0, windowStart: now };
  }
  b.count += 1;
  buckets.set(ip, b);
  return b.count <= RATE_LIMIT;
}

function corsHeaders(origin, methods) {
  const headers = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (url.pathname === '/verify-turnstile') {
      return handleTurnstile(request, env, origin);
    }
    return handleTmdb(request, env, url, origin);
  },
};

async function handleTmdb(request, env, url, origin) {
  const headers = corsHeaders(origin, 'GET, OPTIONS');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: 'Origin not allowed' }, 403, headers);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!isAllowed(ip)) {
    return json({ error: 'Too many requests. Please slow down.' }, 429, headers);
  }

  const tmdbPath = url.pathname.replace(/^\/tmdb/, '') || '/';
  const tmdbUrl = new URL('https://api.themoviedb.org/3' + tmdbPath);
  tmdbUrl.searchParams.set('api_key', env.TMDB_API_KEY);
  for (const [key, value] of url.searchParams.entries()) {
    tmdbUrl.searchParams.set(key, value);
  }

  try {
    const tmdbRes = await fetch(tmdbUrl.toString());
    const body = await tmdbRes.text();
    return new Response(body, {
      status: tmdbRes.status,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    return json({ error: 'Upstream TMDB request failed' }, 502, headers);
  }
}

async function handleTurnstile(request, env, origin) {
  const headers = corsHeaders(origin, 'POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: 'Origin not allowed' }, 403, headers);
  }

  let token;
  try {
    const body = await request.json();
    token = body.token;
  } catch (e) {
    return json({ success: false, error: 'Malformed request' }, 400, headers);
  }
  if (!token) {
    return json({ success: false, error: 'Missing token' }, 400, headers);
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const verifyBody = new FormData();
  verifyBody.append('secret', env.TURNSTILE_SECRET_KEY);
  verifyBody.append('response', token);
  if (ip) verifyBody.append('remoteip', ip);

  try {
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyBody,
    });
    const result = await verifyRes.json();
    return json({ success: !!result.success }, 200, headers);
  } catch (e) {
    return json({ success: false, error: 'Verification service unreachable' }, 502, headers);
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

