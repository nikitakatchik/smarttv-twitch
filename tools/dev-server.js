#!/usr/bin/env node
/*
 * tools/dev-server.js — zero-dependency static server for the web harness.
 *
 *   node tools/dev-server.js [port]
 *
 * Mounts the shared tree so the SAME relative paths the packaged builds use
 * (core/, ui/, lang/, assets/, platform/) resolve in development, and exposes
 * a `/relay?url=<target>` endpoint that forwards Twitch requests without a
 * browser Origin header — the local stand-in for the production relay, used
 * when a stream's variant-playlist host 403s non-Twitch origins.
 *
 *   Plain:  http://localhost:8080
 *   Relay:  http://localhost:8080/?relay=http://localhost:8080
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);

const MOUNTS = {
  '/core/': path.join(SRC, 'core'),
  '/ui/': path.join(SRC, 'ui'),
  '/lang/': path.join(SRC, 'lang'),
  '/assets/': path.join(SRC, 'assets'),
  '/platform/': path.join(SRC, 'platforms', 'web')
};
const INDEX = path.join(SRC, 'platforms', 'web', 'index.html');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.m3u8': 'application/vnd.apple.mpegurl'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Access-Control-Allow-Origin': '*' }, headers || {}));
  res.end(body);
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { return send(res, 404, 'Not found'); }
    send(res, 200, data, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  });
}

// Rewrite the URLs inside an HLS playlist so every nested fetch (variant
// playlists, segments) routes back through this relay too. This is what makes
// the whole chain work from a browser/old-TV origin: the client only ever
// touches the relay, never Twitch directly.
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

function hostAllowed(host) {
  var doms = ['ttvnw.net', 'twitch.tv', 'jtvnw.net'];
  for (var i = 0; i < doms.length; i++) {
    if (host === doms[i] || host.slice(-(doms[i].length + 1)) === '.' + doms[i]) { return true; }
  }
  return false;
}

// Forward a Twitch request through Node (no browser Origin header => no 403).
async function relay(req, res, target, selfBase) {
  try {
    const headers = {};
    if (req.headers['client-id']) { headers['Client-ID'] = req.headers['client-id']; }
    if (req.headers['content-type']) { headers['Content-Type'] = req.headers['content-type']; }
    let body;
    if (req.method === 'POST') {
      body = await new Promise((resolve) => {
        const chunks = []; req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });
    }
    const upstream = await fetch(target, { method: req.method, headers, body });
    const ctype = upstream.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await upstream.arrayBuffer());

    // If it's an HLS playlist, rewrite nested URLs through the relay.
    const text = buf.length < 2_000_000 ? buf.toString('utf8') : '';
    if (text.indexOf('#EXTM3U') === 0) {
      send(res, upstream.status, rewriteM3u8(text, selfBase, target),
        { 'Content-Type': 'application/vnd.apple.mpegurl' });
    } else {
      send(res, upstream.status, buf, { 'Content-Type': ctype });
    }
  } catch (e) {
    send(res, 502, 'relay error: ' + e.message);
  }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Client-ID, Content-Type'
    });
  }

  if (u.pathname === '/relay') {
    const target = u.searchParams.get('url');
    if (!target) { return send(res, 400, 'missing url'); }
    var tUrl;
    try { tUrl = new URL(target); } catch (e) { return send(res, 400, 'bad url'); }
    if (tUrl.protocol !== 'https:' || !hostAllowed(tUrl.hostname)) { return send(res, 403, 'forbidden host'); }
    const selfBase = 'http://' + (req.headers.host || ('localhost:' + PORT));
    return relay(req, res, target, selfBase);
  }

  if (u.pathname === '/' || u.pathname === '') { return serveFile(res, INDEX); }

  for (const prefix in MOUNTS) {
    if (u.pathname.indexOf(prefix) === 0) {
      const rel = u.pathname.slice(prefix.length).replace(/\.\.+/g, '');
      return serveFile(res, path.join(MOUNTS[prefix], rel));
    }
  }
  send(res, 404, 'Not found: ' + u.pathname);
});

server.listen(PORT, () => {
  console.log('Twitch TV harness:  http://localhost:' + PORT);
  console.log('With CORS relay:    http://localhost:' + PORT + '/?relay=http://localhost:' + PORT);
});
