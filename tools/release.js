#!/usr/bin/env node
/*
 * tools/release.js — build the platform-independent release packages.
 *
 *   node tools/release.js   ->   dist/release/*.zip
 *
 * One downloadable package per target, because the install path differs by
 * Samsung generation. Asset names are UNVERSIONED so a stable "latest" download
 * link works:
 *   https://github.com/<owner>/<repo>/releases/latest/download/<name>.zip
 * (the version lives inside each zip — config.xml / package.json — and on the
 * release tag).
 *
 *   twellie-tizen.zip   2015+ Tizen web app (sign into a .wgt, sideload)
 *   twellie-orsay.zip   2013–2014 Orsay widget, raw (advanced; direct)
 *   twellie-web.zip     the browser build (static hosting / demo)
 *
 * The Orsay HOST ships as a self-contained download, one per OS/arch
 * (twellie-orsay-host-<os>-<arch>.zip) — it bundles the official, signed Node
 * binary for that target, so it's built separately; see tools/bin.js
 * (`npm run host:bin -- --all`).
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

// One self-contained package per generation.
writeZip('twellie-orsay.zip', zipDir(build('orsay')));
writeZip('twellie-tizen.zip', zipDir(build('tizen')));
writeZip('twellie-web.zip', zipDir(build('web')));

console.log('done.');
