#!/usr/bin/env node
/*
 * tools/release.js — build the per-generation release packages.
 *
 *   node tools/release.js   ->   dist/release/*.zip
 *
 * Produces one downloadable package per target, because the install path
 * differs by Samsung generation:
 *
 *   twellie-tizen-<v>.zip   2015+ Tizen web app (sign into a .wgt, sideload)
 *   twellie-orsay-<v>.zip   2011–2014 Orsay widget (advanced/USB; needs a relay)
 *   twellie-host-<v>.zip    the self-contained host: installs + relays for
 *                           Orsay TVs with just `node tools/host.js`
 *   twellie-web-<v>.zip     the browser build (static hosting / demo)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const { build, ROOT } = require('./build');
const { zip, zipDir, collect } = require('./lib/zip');

const V = pkg.version;
const OUT = path.join(ROOT, 'dist', 'release');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function writeZip(name, buf) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('  ' + name + '  (' + Math.round(buf.length / 1024) + ' KB)');
}

console.log('packaging v' + V + ' -> dist/release/');

// One self-contained package per generation.
writeZip('twellie-orsay-' + V + '.zip', zipDir(build('orsay')));
writeZip('twellie-tizen-' + V + '.zip', zipDir(build('tizen')));
writeZip('twellie-web-' + V + '.zip', zipDir(build('web')));

// The host bundle: just enough to run `node tools/host.js` after unzip.
const hostFiles = []
  .concat(collect(path.join(ROOT, 'src'), 'src'))
  .concat(collect(path.join(ROOT, 'tools'), 'tools'));
hostFiles.push({ name: 'package.json', data: fs.readFileSync(path.join(ROOT, 'package.json')) });
hostFiles.push({
  name: 'RUN.txt',
  data: Buffer.from(
    'Twellie host (for Samsung Orsay TVs, 2011-2014)\n\n' +
    'Requires Node.js 18+ (https://nodejs.org).\n\n' +
    'Run:\n    node tools/host.js\n\n' +
    'Then follow the on-screen instructions to install on your TV.\n' +
    'Keep it running while watching. See docs/INSTALL.md for details.\n'
  )
});
writeZip('twellie-host-' + V + '.zip', zip(hostFiles));

console.log('done.');
