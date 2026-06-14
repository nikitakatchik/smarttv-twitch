/*
 * tools/host-bundle.js — the host entry that gets inlined into the single
 * `host.js` shipped in the desktop installer package (see tools/bin.js), run by
 * the bundled, already-signed Node runtime as `./node host.js`.
 *
 * The Orsay widget is embedded at build time as the global __TWELLIE_WIDGET__
 * (an array of { name, b64 }), so the package needs nothing else on disk.
 */
'use strict';

const { startHost, lanIP } = require('./lib/serve-host');

// Prepended by tools/bin.js as `var __TWELLIE_WIDGET__ = [...]`.
const widget = __TWELLIE_WIDGET__.map((f) => ({ name: f.name, data: Buffer.from(f.b64, 'base64') }));

// Default to port 80: Orsay (2013-2014 F/H) TVs enter only an IP for the App-Sync
// server — there's no port field — so the TV always fetches the widget on port 80.
// A numeric CLI arg (or PORT env) overrides, so `node host.js 8080` still works for
// the rare firmware that accepts an ip:port, or for testing.
function argPort() {
  for (let i = process.argv.length - 1; i >= 1; i--) {
    if (/^\d+$/.test(process.argv[i])) { return parseInt(process.argv[i], 10); }
  }
  return parseInt(process.env.PORT || '80', 10);
}

startHost(widget, { ip: lanIP(), port: argPort() });
