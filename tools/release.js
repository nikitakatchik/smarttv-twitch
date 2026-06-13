#!/usr/bin/env node
/*
 * tools/release.js — build the per-generation release packages.
 *
 *   node tools/release.js   ->   dist/release/*.zip
 *
 * Produces one downloadable package per target, because the install path
 * differs by Samsung generation:
 *
 * Asset names are UNVERSIONED so a stable "latest" download link works:
 *   https://github.com/<owner>/<repo>/releases/latest/download/<name>.zip
 * (the version lives inside each zip — config.xml / package.json — and on the
 * release tag).
 *
 *   twellie-tizen.zip        2015+ Tizen web app (sign into a .wgt, sideload)
 *   twellie-orsay.zip        2011–2014 Orsay widget (advanced/USB; needs a relay)
 *   twellie-orsay-host.zip   the self-contained host: installs + relays for Orsay
 *                            TVs with just `node tools/host.js`
 *   twellie-web.zip          the browser build (static hosting / demo)
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
writeZip('twellie-orsay.zip', zipDir(build('orsay')));
writeZip('twellie-tizen.zip', zipDir(build('tizen')));
writeZip('twellie-web.zip', zipDir(build('web')));

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
    'Keep it running while watching.\n\n' +
    'Full guide: https://github.com/nikitakatchik/smarttv-twitch/tree/master/docs/install\n'
  )
});
writeZip('twellie-orsay-host.zip', zip(hostFiles));

console.log('done.');
