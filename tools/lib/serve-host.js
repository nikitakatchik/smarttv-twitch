/*
 * tools/lib/serve-host.js — the sideload INSTALL host, shared by:
 *   - tools/host.js         dev convenience (`npm run host`); builds from src/
 *   - tools/host-bundle.js  the host.js shipped in the desktop installer package
 *
 * Serves the develop-account App-Sync endpoints (widgetlist.xml + the zip) on
 * the LAN so a 2013–2014 Orsay TV can install Twellie over Wi-Fi.
 */
'use strict';

const http = require('http');
const os = require('os');
const { zip } = require('./zip');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Best guess at the LAN address the TV should point at.
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

function banner(IP, PORT, BASE) {
  const line = '  ' + Array(56).join('-');
  const out = [''];
  out.push('  Twellie installer is running.');
  out.push(line);
  out.push('  Your computer IP : ' + IP);
  out.push('  Install URL      : ' + BASE);
  out.push(line);
  out.push('  Install on an Orsay TV (2013-2014):');
  out.push('     1. On the TV, sign in to Smart Hub as user:  develop');
  out.push('     2. Set the App-Sync server IP to:  ' + IP + (PORT === 80 ? '' : '  (port ' + PORT + ')'));
  out.push('     3. Run "Start App Sync" — Twellie installs.');
  out.push('');
  out.push('  Once Twellie is on the TV you can close this window.');
  out.push('  Press Ctrl+C to stop.');
  out.push('');
  return out.join('\n');
}

// widgetFiles: [{ name, data: Buffer }] of the built Orsay widget.
// opts: { ip?, port, quiet? }.
function startHost(widgetFiles, opts) {
  const IP = opts.ip || lanIP();
  const PORT = opts.port;
  const BASE = 'http://' + IP + ':' + PORT;
  const zipBuf = zip(widgetFiles);

  const WIDGETLIST =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rsp stat="ok"><list><widget id="Twellie">' +
    '<title>Twellie</title>' +
    '<compression size="' + zipBuf.length + '" type="zip"/>' +
    '<description>Twellie - independent client for watching Twitch streams</description>' +
    '<download>' + BASE + '/Twellie.zip</download>' +
    '</widget></list></rsp>';

  const STATUS_PAGE =
    '<!doctype html><meta charset="utf-8"><title>Twellie installer</title>' +
    '<body style="font-family:sans-serif;background:#14141a;color:#eee;padding:40px">' +
    '<h1>Twellie installer is running</h1>' +
    '<p>App-Sync server IP for your TV: <b>' + IP + '</b>' + (PORT === 80 ? '' : ' (port ' + PORT + ')') + '</p>' +
    '<p>On the TV: sign in as <code>develop</code>, set the App-Sync IP above, run Start App Sync.</p>' +
    '<p>You can close this once Twellie is installed.</p></body>';

  function send(res, status, body, headers) {
    res.writeHead(status, Object.assign({ 'Access-Control-Allow-Origin': '*' }, headers || {}));
    res.end(body);
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, BASE);
    if (req.method === 'OPTIONS') { return send(res, 204, '', CORS); }
    if (u.pathname === '/widgetlist.xml') { return send(res, 200, WIDGETLIST, { 'Content-Type': 'text/xml' }); }
    if (u.pathname === '/Twellie.zip') { return send(res, 200, zipBuf, { 'Content-Type': 'application/zip' }); }
    if (u.pathname === '/' || u.pathname === '') { return send(res, 200, STATUS_PAGE, { 'Content-Type': 'text/html' }); }
    return send(res, 404, 'not found');
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error('\n  Port ' + PORT + ' is already in use. Start it on another port by passing\n' +
        '  a number as the first argument, e.g.  ' + (PORT + 1) + '\n');
    } else if (e.code === 'EACCES') {
      console.error('\n  No permission to bind port ' + PORT + ' (ports below 1024 need admin).\n' +
        '  Try a higher port like 8080.\n');
    } else {
      console.error('\n  Host error: ' + e.message + '\n');
    }
    process.exit(1);
  });

  server.listen(PORT, '0.0.0.0', () => {
    if (!opts.quiet) { console.log(banner(IP, PORT, BASE)); }
  });
  return server;
}

module.exports = { startHost, lanIP };
