#!/usr/bin/env node
/*
 * tools/dev-server.js — zero-dependency static server for the web harness.
 *
 *   node tools/dev-server.js [port]
 *
 * Mounts the shared tree so the SAME relative paths the packaged builds use
 * (core/, ui/, lang/, assets/, platform/) resolve in development, and exposes
 * `/relay?url=<target>` (see tools/lib/relay.js) so the browser harness can
 * reach Twitch despite CORS — the local stand-in for the production relay.
 *
 *   http://localhost:8080
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { relayHttp, CORS } = require('./lib/relay');

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

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') { return send(res, 204, '', CORS); }

  if (u.pathname === '/relay') {
    const target = u.searchParams.get('url');
    if (!target) { return send(res, 400, 'missing url'); }
    return relayHttp(req, res, target, 'http://' + (req.headers.host || ('localhost:' + PORT)));
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
  console.log('Twellie harness:    http://localhost:' + PORT);
  console.log('Relay endpoint:     http://localhost:' + PORT + '/relay?url=<twitch url>');
});
