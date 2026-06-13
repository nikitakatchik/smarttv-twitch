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
 *   - web:    static-host dist/web/ (behind a relay) or just use `npm start`.
 *
 * Importable: require('./build').build('orsay') returns the output dir.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const ALL = ['orsay', 'tizen', 'web'];
const PLATFORM_FILES = new Set(['index.html', 'config.xml', 'widget.info']);

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

function buildAll(target) {
  (target ? [target] : ALL).forEach((p) => {
    const out = build(p);
    console.log('built ' + p + ' -> ' + path.relative(ROOT, out));
  });
}

module.exports = { build, buildAll, ALL, ROOT, SRC, DIST };

if (require.main === module) {
  try {
    buildAll(process.argv[2]);
  } catch (e) {
    console.error('build failed: ' + e.message);
    process.exit(1);
  }
}
