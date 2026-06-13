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

// Accept an optional port from any numeric CLI arg, so both `node host.js 8080`
// and a launcher that forwards args work without hard-coding an index.
function argPort() {
  for (let i = process.argv.length - 1; i >= 1; i--) {
    if (/^\d+$/.test(process.argv[i])) { return parseInt(process.argv[i], 10); }
  }
  return parseInt(process.env.PORT || '8080', 10);
}

startHost(widget, { ip: lanIP(), port: argPort() });
