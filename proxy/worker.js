/*
 * proxy/worker.js — Cloudflare Worker: Twitch relay + Helix token broker.
 *
 * Deploy this and point the app at it (TW.config.api.proxyBase / relayBase, or
 * the harness's ?proxy=/?relay= query) to get either or both of:
 *
 *   1. RELAY  — GET/POST <worker>/relay?url=<encoded target>
 *      Forwards a Twitch request from a real server (no browser Origin header,
 *      modern TLS/SNI), and rewrites HLS playlist bodies so every nested fetch
 *      routes back through the relay too. This is what lets a 2011 Orsay TV
 *      (no SNI) and a browser (CORS-gated) reach Twitch's gql / usher /
 *      *.playlist.ttvnw.net hosts.
 *
 *   2. HELIX  — GET <worker>/helix/<path>
 *      The official, ToS-compliant browse path. The worker holds the client
 *      secret (never the app), runs the client_credentials flow, caches the
 *      ~60-day app token, and injects Client-Id + Bearer. Set the secrets:
 *        wrangler secret put TWITCH_CLIENT_ID
 *        wrangler secret put TWITCH_CLIENT_SECRET
 *
 * The app never sees the secret and only ever talks to your worker origin.
 */

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX_BASE = 'https://api.twitch.tv/helix';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Client-ID, Content-Type',
  'Access-Control-Max-Age': '86400',
};

// Per-isolate app-token cache. For strict single-token behaviour under load,
// back this with Workers KV or the Cache API instead.
let cachedToken = null;
let cachedExpiry = 0;

async function getAppToken(env) {
  const now = Date.now();
  if (cachedToken && now < cachedExpiry - 300000) { return cachedToken; }
  const body = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) { throw new Error('token request failed: ' + res.status); }
  const json = await res.json();
  cachedToken = json.access_token;
  cachedExpiry = now + json.expires_in * 1000; // expires_in is SECONDS
  return cachedToken;
}

function rewriteM3u8(text, selfBase, baseUrl) {
  function wrap(u) {
    var abs;
    try { abs = new URL(u, baseUrl).href; } catch (e) { return u; }
    return selfBase + '/relay?url=' + encodeURIComponent(abs);
  }
  var NL = String.fromCharCode(10), CR = String.fromCharCode(13);
  var lines = text.split(NL), out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.charAt(line.length - 1) === CR) { line = line.slice(0, -1); }
    out.push((line && line.charAt(0) !== '#') ? wrap(line) : line);
  }
  return out.join(NL);
}

function cors(headers = {}) { return { ...CORS, ...headers }; }

function hostAllowed(host) {
  var doms = ['ttvnw.net', 'twitch.tv', 'jtvnw.net'];
  for (var i = 0; i < doms.length; i++) {
    if (host === doms[i] || host.slice(-(doms[i].length + 1)) === '.' + doms[i]) { return true; }
  }
  return false;
}

async function handleRelay(request, selfBase) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) { return new Response('missing url', { status: 400, headers: cors() }); }

  let tUrl;
  try { tUrl = new URL(target); } catch (e) { return new Response('bad url', { status: 400, headers: cors() }); }
  if (tUrl.protocol !== 'https:' || !hostAllowed(tUrl.hostname)) {
    return new Response('forbidden host', { status: 403, headers: cors() });
  }

  const headers = {};
  const cid = request.headers.get('client-id');
  const ctype = request.headers.get('content-type');
  if (cid) { headers['Client-ID'] = cid; }
  if (ctype) { headers['Content-Type'] = ctype; }

  const init = { method: request.method, headers };
  if (request.method === 'POST') {
    var cl = parseInt(request.headers.get('content-length') || '0', 10);
    if (cl > 262144) { return new Response('payload too large', { status: 413, headers: cors() }); }
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const upType = upstream.headers.get('content-type') || 'application/octet-stream';
  const buf = await upstream.arrayBuffer();
  const text = buf.byteLength < 3_000_000 ? new TextDecoder().decode(buf) : '';

  if (text.startsWith('#EXTM3U')) {
    return new Response(rewriteM3u8(text, selfBase, target), {
      status: upstream.status,
      headers: cors({ 'Content-Type': 'application/vnd.apple.mpegurl' }),
    });
  }
  return new Response(buf, { status: upstream.status, headers: cors({ 'Content-Type': upType }) });
}

async function handleHelix(request, env) {
  const url = new URL(request.url);
  const token = await getAppToken(env);
  const target = HELIX_BASE + url.pathname.slice('/helix'.length) + url.search;
  const upstream = await fetch(target, {
    method: 'GET',
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: 'Bearer ' + token },
  });
  const headers = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(CORS)) { headers.set(k, v); }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') { return new Response(null, { status: 204, headers: cors() }); }

    const url = new URL(request.url);
    const selfBase = url.origin;

    try {
      if (url.pathname === '/relay') { return await handleRelay(request, selfBase); }
      if (url.pathname.startsWith('/helix/')) { return await handleHelix(request, env); }
      if (url.pathname === '/' || url.pathname === '/health') {
        return new Response('smarttv-twitch relay: /relay?url= and /helix/* are live\n',
          { status: 200, headers: cors({ 'Content-Type': 'text/plain' }) });
      }
      return new Response('not found', { status: 404, headers: cors() });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 502, headers: cors({ 'Content-Type': 'application/json' }),
      });
    }
  },
};
