#!/usr/bin/env node
/*
 * tools/host.js — self-contained sideload host + relay for IP-installed TVs.
 *
 *   npm run host            (or: node tools/host.js [port])
 *
 * Old Samsung "Orsay" TVs (2011–2014) install apps over the LAN and — because
 * they can't do modern TLS/SNI — need a relay to reach Twitch at all. This one
 * command does everything, with no dependencies and no install step:
 *
 *   1. detects your computer's LAN IP,
 *   2. builds the Orsay widget pointed at THIS host as its relay,
 *   3. zips it and writes a widgetlist.xml for "develop"-account App Sync,
 *   4. serves the App-Sync endpoints + the /relay endpoint, and
 *   5. prints exactly what to type on the TV.
 *
 * Keep it running while watching: the TV streams Twitch through /relay.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { build, ROOT } = require('./build');
const { zipDir } = require('./lib/zip');
const { relayHttp, CORS } = require('./lib/relay');

const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);

function lanIP() {
  const nets = os.networkInterfaces();
  const ipv4 = [];
  for (const name in nets) {
    for (const ni of nets[name]) {
      if (ni.family === 'IPv4' && !ni.internal) { ipv4.push(ni.address); }
    }
  }
  // Prefer typical home-LAN ranges over VPN/other addresses.
  return ipv4.find((a) => a.indexOf('192.168.') === 0)
    || ipv4.find((a) => a.indexOf('10.') === 0)
    || ipv4[0] || '127.0.0.1';
}

const IP = lanIP();
const BASE = 'http://' + IP + ':' + PORT;
const HOST_DIR = path.join(ROOT, 'dist', 'host');
const WIDGET_DIR = path.join(HOST_DIR, 'widget');

// 1–3. Build the Orsay widget configured to relay through THIS host, then zip.
build('orsay', WIDGET_DIR);
const cfgPath = path.join(WIDGET_DIR, 'core', 'config.js');
const cfg = fs.readFileSync(cfgPath, 'utf8');
if (cfg.indexOf("relayBase: ''") < 0) {
  console.error('warning: could not find relayBase in config.js; the widget may not reach Twitch.');
}
fs.writeFileSync(cfgPath, cfg.replace("relayBase: ''", "relayBase: '" + BASE + "'"));

const zipBuf = zipDir(WIDGET_DIR);
fs.writeFileSync(path.join(HOST_DIR, 'Twellie.zip'), zipBuf);

const WIDGETLIST =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<rsp stat="ok"><list><widget id="Twellie">' +
  '<title>Twellie</title>' +
  '<compression size="' + zipBuf.length + '" type="zip"/>' +
  '<description>Twellie — a viewer for Twitch</description>' +
  '<download>' + BASE + '/Twellie.zip</download>' +
  '</widget></list></rsp>';

const STATUS_PAGE =
  '<!doctype html><meta charset="utf-8"><title>Twellie host</title>' +
  '<body style="font-family:sans-serif;background:#14141a;color:#eee;padding:40px">' +
  '<h1>Twellie host is running</h1>' +
  '<p>App-Sync server IP for your TV: <b>' + IP + '</b>' + (PORT === 80 ? '' : ' (port ' + PORT + ')') + '</p>' +
  '<p>Endpoints: <code>/widgetlist.xml</code>, <code>/Twellie.zip</code>, <code>/relay</code>.</p>' +
  '<p>See the install guide for step-by-step instructions.</p></body>';

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Access-Control-Allow-Origin': '*' }, headers || {}));
  res.end(body);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  if (req.method === 'OPTIONS') { return send(res, 204, '', CORS); }
  if (u.pathname === '/relay') {
    const target = u.searchParams.get('url');
    if (!target) { return send(res, 400, 'missing url'); }
    return relayHttp(req, res, target, BASE);
  }
  if (u.pathname === '/widgetlist.xml') { return send(res, 200, WIDGETLIST, { 'Content-Type': 'text/xml' }); }
  if (u.pathname === '/Twellie.zip') { return send(res, 200, zipBuf, { 'Content-Type': 'application/zip' }); }
  if (u.pathname === '/' || u.pathname === '') { return send(res, 200, STATUS_PAGE, { 'Content-Type': 'text/html' }); }
  return send(res, 404, 'not found');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('\n  Port ' + PORT + ' is already in use. Try: npm run host -- ' + (PORT + 1) + '\n');
  } else if (e.code === 'EACCES') {
    console.error('\n  No permission to bind port ' + PORT + ' (ports below 1024 need admin). Try a higher port: npm run host -- 8080\n');
  } else {
    console.error('\n  Host error: ' + e.message + '\n');
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const line = '  ' + Array(56).join('-');
  console.log('');
  console.log('  Twellie host is running.');
  console.log(line);
  console.log('  Your computer IP : ' + IP);
  console.log('  Host URL         : ' + BASE);
  console.log(line);
  console.log('  Install on an Orsay TV (2011–2014) — pick one:');
  console.log('');
  console.log('  A) Network ("develop" account):');
  console.log('     1. On the TV, sign in to Smart Hub as user:  develop');
  console.log('     2. Set the App-Sync server IP to:  ' + IP + (PORT === 80 ? '' : '  (port ' + PORT + ')'));
  console.log('     3. Run "Start App Sync" — Twellie installs.');
  console.log('');
  console.log('  B) USB: copy this folder onto a FAT32 stick under /userwidget/:');
  console.log('     ' + path.relative(process.cwd(), WIDGET_DIR));
  console.log('');
  console.log('  Keep this window open while watching — the TV streams Twitch');
  console.log('  through ' + BASE + '/relay');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
