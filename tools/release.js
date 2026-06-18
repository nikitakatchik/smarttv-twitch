#!/usr/bin/env node
/*
 * tools/release.js — package the base release artifacts.
 *
 *   node tools/release.js
 *     -> dist/release/twellie-orsay.zip   raw 2013-2014 Orsay widget (App-Sync)
 *     -> dist/release/twellie-web.zip      browser build (static hosting / demo)
 *     -> dist/release/Twellie.wgt          Tizen native package for Apps2Samsung
 *
 * This is the internal base packager used by `npm run release`. The public npm
 * target also builds the host installers and TizenBrew module archive.
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
 * release. (`npm run build:tizenbrew` only emits the unpacked module tree.)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
const DIST_PW = 'tizenpkcs12passfordsigner'; // SDK default distributor cert password

function writeZip(name, buf) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('  ' + name + '  (' + Math.round(buf.length / 1024) + ' KB)');
}

function escapeXmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function encryptProfilePassword(s) {
  // Tizen's profile parser decrypts inline passwords with CipherUtil:
  // 3DES/ECB/PKCS5Padding, using the first 24 bytes of this fixed SDK key.
  const key = Buffer.from('KYANINYLhijklmnopqrstuvwx', 'utf8').subarray(0, 24);
  const cipher = crypto.createCipheriv('des-ede3', key, null);
  return Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]).toString('base64');
}

function profileDataDir(env) {
  if (env.source === 'local') {
    return path.join(tizenEnv.LOCAL_SDK_DIR, 'tizen-studio-data');
  }
  if (process.env.TIZEN_SDK_DATA) { return process.env.TIZEN_SDK_DATA; }
  if (env.sdkRoot && path.basename(env.sdkRoot) === 'tizen-studio') {
    return path.join(path.dirname(env.sdkRoot), 'tizen-studio-data');
  }
  return null;
}

function writeGenericProfile(env) {
  const dataDir = profileDataDir(env);
  if (!dataDir || !env.sdkRoot) {
    throw new Error('cannot resolve Tizen profile data directory for ' + env.source + ' SDK');
  }
  const profileXml = path.join(dataDir, 'profile', 'profiles.xml');
  const authorP12 = path.join(CERT_DIR, 'author.p12');
  const distP12 = path.join(env.sdkRoot, 'tools', 'certificate-generator', 'certificates',
    'distributor', 'tizen-distributor-signer.p12');
  const distCa = path.join(env.sdkRoot, 'tools', 'certificate-generator', 'certificates',
    'distributor', 'tizen-distributor-ca.cer');

  fs.mkdirSync(path.dirname(profileXml), { recursive: true });
  fs.writeFileSync(profileXml,
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
    '<profiles active="' + PROFILE + '" version="3.1">\n' +
    '<profile name="' + PROFILE + '">\n' +
    '<profileitem ca="" distributor="0" key="' + escapeXmlAttr(authorP12) +
      '" password="' + encryptProfilePassword(PW) + '" rootca=""/>\n' +
    '<profileitem ca="' + escapeXmlAttr(distCa) + '" distributor="1" key="' +
      escapeXmlAttr(distP12) + '" password="' + encryptProfilePassword(DIST_PW) +
      '" rootca=""/>\n' +
    '<profileitem ca="" distributor="2" key="" password="" rootca=""/>\n' +
    '</profile>\n' +
    '</profiles>\n');
  execFileSync(env.tizen, ['cli-config', 'profiles.path=' + profileXml], { stdio: 'inherit' });
}

// Self-made author cert + a generic signing profile (default distributor cert).
// Idempotent: only mints the author cert once, always rewrites the profile.
function ensureGenericProfile(env) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const authorP12 = path.join(CERT_DIR, 'author.p12');
  if (!fs.existsSync(authorP12)) {
    console.log('  minting a throwaway generic author cert (one-time)…');
    execFileSync(env.tizen, ['certificate', '-a', PROFILE, '-p', PW, '-f', 'author', '--', CERT_DIR], { stdio: 'inherit' });
  }
  writeGenericProfile(env);
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
  const outWgt = path.join(OUT, 'Twellie.wgt');
  fs.rmSync(outWgt, { force: true });
  console.log('building + signing Twellie.wgt (generic cert; Apps2Samsung re-signs per-TV)…');
  ensureGenericProfile(env);
  const dir = build('tizen'); // dist/tizen
  execFileSync(cli, ['build-web', '--', dir], { stdio: 'inherit' });
  const built = path.join(dir, '.buildResult');
  fs.rmSync(path.join(built, 'Twellie.wgt'), { force: true });
  execFileSync(cli, ['package', '-t', 'wgt', '-s', PROFILE, '--', built], { stdio: 'inherit' });
  const wgt = fs.readdirSync(built).find((f) => f.endsWith('.wgt'));
  if (!wgt) throw new Error('tizen package produced no .wgt in ' + built);
  fs.copyFileSync(path.join(built, wgt), outWgt);
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
