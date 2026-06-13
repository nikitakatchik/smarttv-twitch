/*
 * tools/lib/relay.js — the Twitch relay, shared by the dev server and the host.
 *
 * Uses Node's https module (NOT global fetch) on purpose: fetch emits an
 * ExperimentalWarning on Node 18/20, and the host app must run clean for
 * non-developers. Forwards a request to Twitch from the server (no browser
 * Origin header, modern TLS/SNI) and rewrites HLS playlist bodies so every
 * nested fetch (variant playlists, segments) routes back through the relay.
 */
'use strict';

const https = require('https');

const ALLOWED = ['ttvnw.net', 'twitch.tv', 'jtvnw.net'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Client-ID, Content-Type'
};

function hostAllowed(h) {
  for (let i = 0; i < ALLOWED.length; i++) {
    const d = ALLOWED[i];
    if (h === d || h.slice(-(d.length + 1)) === '.' + d) { return true; }
  }
  return false;
}

function rewriteM3u8(text, selfBase, baseUrl) {
  const NL = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  const lines = text.split(NL);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.charAt(line.length - 1) === CR) { line = line.slice(0, -1); }
    if (line && line.charAt(0) !== '#') {
      let abs;
      try { abs = new URL(line, baseUrl).href; } catch (e) { out.push(line); continue; }
      out.push(selfBase + '/relay?url=' + encodeURIComponent(abs));
    } else {
      out.push(line);
    }
  }
  return out.join(NL);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function fetchUpstream(target, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    const r = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: method, headers: headers, port: 443 },
      (resp) => {
        const chunks = [];
        resp.on('data', (c) => chunks.push(c));
        resp.on('end', () => resolve({ status: resp.statusCode, type: resp.headers['content-type'], body: Buffer.concat(chunks) }));
      }
    );
    r.on('error', reject);
    if (body && body.length) { r.write(body); }
    r.end();
  });
}

// Handle a GET/POST /relay?url=<target> request on a Node http server.
async function relayHttp(req, res, target, selfBase) {
  function send(status, body, type) {
    res.writeHead(status, Object.assign({ 'Content-Type': type || 'text/plain' }, CORS));
    res.end(body);
  }
  let u;
  try { u = new URL(target); } catch (e) { return send(400, 'bad url'); }
  if (u.protocol !== 'https:' || !hostAllowed(u.hostname)) { return send(403, 'forbidden host'); }

  try {
    const headers = {};
    if (req.headers['client-id']) { headers['Client-ID'] = req.headers['client-id']; }
    if (req.headers['content-type']) { headers['Content-Type'] = req.headers['content-type']; }
    let body = null;
    if (req.method === 'POST') {
      body = await readBody(req);
      if (body.length > 262144) { return send(413, 'payload too large'); }
    }
    const up = await fetchUpstream(target, req.method, headers, body);
    const text = up.body.length < 2000000 ? up.body.toString('utf8') : '';
    if (text.indexOf('#EXTM3U') === 0) {
      send(up.status, rewriteM3u8(text, selfBase, target), 'application/vnd.apple.mpegurl');
    } else {
      send(up.status, up.body, up.type || 'application/octet-stream');
    }
  } catch (e) {
    send(502, 'relay error: ' + e.message);
  }
}

module.exports = { relayHttp, hostAllowed, rewriteM3u8, CORS };
