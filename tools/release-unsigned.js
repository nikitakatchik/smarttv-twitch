#!/usr/bin/env node
/*
 * tools/release-unsigned.js — the RAW, UNSIGNED bundles.
 *
 *   node tools/release-unsigned.js   ->   dist/release/*-unsigned.zip
 *
 * These are NOT finished installers — they're the inputs to signing and the
 * advanced / self-host paths:
 *
 *   twellie-tizen-unsigned.zip   2015+ Tizen web project. Sign it into a .wgt
 *                                yourself (docs/install/tizen.md), or from the
 *                                repo run `npm run cert` then `npm run release`.
 *   twellie-orsay-unsigned.zip   raw 2013-2014 Orsay widget, for the "host it
 *                                yourself" App-Sync path (docs/install/orsay-2013-2014.md).
 *   twellie-web-unsigned.zip     the browser build, for static hosting / demo.
 *
 * Asset names are UNVERSIONED so a stable "latest" link works; the version lives
 * inside each zip (config.xml / package.json) and on the release tag. The
 * finished, SIGNED artifacts (Orsay host installers + a signed Tizen .wgt) come
 * from `npm run release`.
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

console.log('packaging v' + V + ' unsigned bundles -> dist/release/');
writeZip('twellie-orsay-unsigned.zip', zipDir(build('orsay')));
writeZip('twellie-tizen-unsigned.zip', zipDir(build('tizen')));
writeZip('twellie-web-unsigned.zip', zipDir(build('web')));
console.log('done.');
