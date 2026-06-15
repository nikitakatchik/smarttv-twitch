#!/usr/bin/env node
/*
 * tools/build.js — assemble a self-contained package per platform.
 *
 *   node tools/build.js [orsay|tizen|web]   (no arg = all)
 *
 * Produces dist/<platform>/ with the SAME relative layout the index.html
 * expects (core/ ui/ lang/ assets/ platform/), so the package runs unchanged:
 *   - Orsay:  zip dist/orsay/ into the widget archive.
 *   - Tizen:  `tizen build-web` + `tizen package -t wgt` over dist/tizen/.
 *   - web:    static-host dist/web/ or just use `npm start`.
 *
 * Importable: require('./build').build('orsay') returns the output dir.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const ALL = ['orsay', 'tizen', 'web', 'tizenbrew'];
const PLATFORM_FILES = new Set(['index.html', 'config.xml', 'widget.info']);

// The TizenBrew module manifest (emitted at dist/tizenbrew/package.json). This
// is NOT the repo's package.json — it tells TizenBrew how to load the module:
// packageType 'app', the entry html, and the remote keys to registerKey for us.
const MODULE_PKG = {
  name: 'twellie-tizenbrew',
  version: '4.0.0',
  description: 'Twellie — an unofficial Twitch viewer for Samsung TVs, as a TizenBrew app module (HTML5 video + hls.js).',
  packageType: 'app',
  appName: 'Twellie',
  appPath: 'app/index.html',
  keys: [
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'ChannelUp', 'ChannelDown', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  ],
};

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.DS_Store') { continue; }
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) { copyDir(s, d); }
    else { fs.copyFileSync(s, d); }
  }
}

// Assemble one platform into outDir (default dist/<platform>) and return it.
function build(platform, outDir) {
  const pdir = path.join(SRC, 'platforms', platform);
  if (!fs.existsSync(pdir)) { throw new Error('unknown platform: ' + platform); }
  const out = outDir || path.join(DIST, platform);
  fs.rmSync(out, { recursive: true, force: true });

  for (const dir of ['core', 'ui', 'lang', 'assets']) {
    copyDir(path.join(SRC, dir), path.join(out, dir));
  }
  for (const e of fs.readdirSync(pdir)) {
    const dst = PLATFORM_FILES.has(e) ? path.join(out, e) : path.join(out, 'platform', e);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(pdir, e), dst);
  }
  return out;
}

// TizenBrew wants the runnable app under app/ with the manifest as a root
// sibling (appPath = 'app/index.html'). Reuse build() to assemble app/, then
// drop the manifest beside it. Output: dist/tizenbrew/{package.json, app/...}.
function buildTizenbrew(outDir) {
  const out = outDir || path.join(DIST, 'tizenbrew');
  fs.rmSync(out, { recursive: true, force: true });
  build('tizenbrew', path.join(out, 'app'));
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(MODULE_PKG, null, 2) + '\n');
  return out;
}

function buildAll(target) {
  (target ? [target] : ALL).forEach((p) => {
    const out = p === 'tizenbrew' ? buildTizenbrew() : build(p);
    console.log('built ' + p + ' -> ' + path.relative(ROOT, out));
  });
}

module.exports = { build, buildTizenbrew, buildAll, ALL, MODULE_PKG, ROOT, SRC, DIST };

if (require.main === module) {
  try {
    buildAll(process.argv[2]);
  } catch (e) {
    console.error('build failed: ' + e.message);
    process.exit(1);
  }
}
