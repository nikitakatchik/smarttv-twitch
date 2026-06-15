#!/usr/bin/env node
/*
 * tools/release.js — package the shippable artifacts.
 *
 *   node tools/release.js
 *     -> dist/release/twellie-orsay.zip   raw 2013-2014 Orsay widget (App-Sync)
 *     -> dist/release/twellie-web.zip      browser build (static hosting / demo)
 *     -> dist/release/Twellie.wgt          Tizen native package for Apps2Samsung
 *
 * The .wgt is signed with a throwaway, self-made GENERIC author profile (no
 * Samsung account, no DUID) — just enough to be a valid Tizen package. It is NOT
 * bound to any TV. Installers like **Apps2Samsung** RE-SIGN every custom .wgt
 * with a Samsung author+distributor cert minted for the target TV's DUID before
 * installing, so the cert used here is irrelevant on the device.
 * See docs/install/apps2samsung.md.
 *
 * Building the .wgt needs the Tizen CLI. If it isn't present, release AUTO-FETCHES
 * a self-contained one into gitignored dist/.tizen-sdk/ (same as `npm run
 * tizen:setup`). Auto-fetch is skipped under CI ($CI) so the PR check stays fast —
 * release.yml fetches it explicitly there. If the CLI is still missing — or the
 * package step fails (e.g. Rosetta 2 not installed on Apple Silicon) — the zips
 * are still produced and the .wgt is skipped with a note, so this never blocks a
 * release. (TizenBrew is a separate path: `npm run build:tizenbrew`.)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pkg = require('../package.json');
const { build, ROOT } = require('./build');
const { zipDir } = require('./lib/zip');
const tizenEnv = require('./lib/tizen-env');

const V = pkg.version;
const OUT = path.join(ROOT, 'dist', 'release');
const CERT_DIR = path.join(ROOT, 'dist', '.tizen-sdk', 'generic-cert'); // gitignored (under dist/)
const PROFILE = 'twellie-generic';
const PW = 'twellie'; // throwaway keystore password — the .wgt is re-signed per-TV anyway

function writeZip(name, buf) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('  ' + name + '  (' + Math.round(buf.length / 1024) + ' KB)');
}

// Self-made author cert + a generic signing profile (default distributor cert).
// Idempotent: only mints the author cert once, always (re)registers the profile.
function ensureGenericProfile(cli) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const authorP12 = path.join(CERT_DIR, 'author.p12');
  if (!fs.existsSync(authorP12)) {
    console.log('  minting a throwaway generic author cert (one-time)…');
    execFileSync(cli, ['certificate', '-a', PROFILE, '-p', PW, '-f', 'author', '--', CERT_DIR], { stdio: 'inherit' });
  }
  execFileSync(cli, ['security-profiles', 'add', '-n', PROFILE, '-a', authorP12, '-p', PW], { stdio: 'inherit' });
}

function buildWgt() {
  let env = tizenEnv.resolve();
  if ((!env || !env.tizen) && !process.env.CI) {
    // No Tizen CLI yet — fetch a self-contained one into gitignored dist/.tizen-sdk/.
    // (Skipped under CI so the PR check stays fast; release.yml fetches it explicitly.)
    console.log('no Tizen CLI found — fetching a self-contained one into dist/.tizen-sdk/ …');
    execFileSync('node', [path.join(__dirname, 'tizen-setup.js'), '--ensure'], { stdio: 'inherit' });
    env = tizenEnv.resolve();
  }
  if (!env || !env.tizen) {
    console.log('\nNOTE: no Tizen CLI — skipping Twellie.wgt (zips above are done).');
    console.log('  Install one with:  npm run tizen:setup   then re-run  npm run release');
    return;
  }
  const cli = env.tizen;
  console.log('building + signing Twellie.wgt (generic cert; Apps2Samsung re-signs per-TV)…');
  ensureGenericProfile(cli);
  const dir = build('tizen'); // dist/tizen
  execFileSync(cli, ['build-web', '--', dir], { stdio: 'inherit' });
  const built = path.join(dir, '.buildResult');
  execFileSync(cli, ['package', '-t', 'wgt', '-s', PROFILE, '--', built], { stdio: 'inherit' });
  const wgt = fs.readdirSync(built).find((f) => f.endsWith('.wgt'));
  if (!wgt) throw new Error('tizen package produced no .wgt in ' + built);
  fs.copyFileSync(path.join(built, wgt), path.join(OUT, 'Twellie.wgt'));
  console.log('  Twellie.wgt');
}

(function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('packaging v' + V + ' -> dist/release/');
  writeZip('twellie-orsay.zip', zipDir(build('orsay')));
  writeZip('twellie-web.zip', zipDir(build('web')));
  try {
    buildWgt();
  } catch (e) {
    // Never let an unverifiable .wgt step block the release; the zips are out.
    console.log('\nWARNING: Twellie.wgt step failed — ' + (e && e.message ? e.message : e));
    console.log('  (the .zip artifacts above were still written.)');
  }
  console.log('done.');
})();
