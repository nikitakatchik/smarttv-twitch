#!/usr/bin/env node
/*
 * tools/release.js — package the shippable bundles. Nothing here is signed:
 * Twellie installs without any Samsung certificate.
 *
 *   node tools/release.js   ->   dist/release/twellie-{orsay,web}.zip
 *
 *   twellie-orsay.zip   the raw 2013-2014 Orsay widget the host serves over
 *                       App-Sync (docs/install/orsay-2013-2014.md). Build the
 *                       host installers separately with `npm run host:bin`.
 *   twellie-web.zip     the browser build, for static hosting / demo.
 *
 * Tizen (2015+) is distributed as a TizenBrew module, not a zip here: run
 * `npm run build:tizenbrew` and publish dist/tizenbrew/ (docs/install/tizenbrew.md).
 *
 * Asset names are UNVERSIONED so a stable "latest" link works; the version lives
 * inside each zip (config.xml) and on the release tag.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const { build, ROOT } = require('./build');
const { zipDir } = require('./lib/zip');

const V = pkg.version;
const OUT = path.join(ROOT, 'dist', 'release');
fs.mkdirSync(OUT, { recursive: true });

function writeZip(name, buf) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('  ' + name + '  (' + Math.round(buf.length / 1024) + ' KB)');
}

console.log('packaging v' + V + ' -> dist/release/');
writeZip('twellie-orsay.zip', zipDir(build('orsay')));
writeZip('twellie-web.zip', zipDir(build('web')));
console.log('done.  (Tizen ships via TizenBrew: npm run build:tizenbrew + publish.)');
