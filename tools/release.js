#!/usr/bin/env node
/*
 * tools/release.js — build the FINISHED, SIGNED release artifacts.
 *
 *   node tools/release.js
 *     -> dist/release/twellie-orsay-host-<os>-<arch>.zip   (x3; bundles signed Node)
 *     -> dist/release/Twellie.wgt                          (Tizen, signed with your cert)
 *
 * This target REQUIRES everything needed to actually ship and NEVER falls back to
 * an unsigned artifact. Prerequisites (any missing => hard error):
 *   - the host-binary toolchain (tools/bin.js), and
 *   - a Samsung signing profile from `npm run cert` (under ~/Documents/Dev/SamsungTV)
 *     plus the Tizen `tizen` CLI (the "Tizen TV" VS Code extension ships it).
 *
 * For the raw, unsigned bundles (Tizen project to self-sign, raw Orsay widget,
 * web build) use `npm run release-unsigned` — that is what CI publishes, since a
 * Samsung-signed .wgt is bound to your own cert + TV DUIDs and can't be built in CI.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { build, ROOT } = require('./build');

const OUT = path.join(ROOT, 'dist', 'release');
const CERT_DIR = path.join(os.homedir(), 'Documents', 'Dev', 'SamsungTV');
const PROFILE_JSON = path.join(CERT_DIR, 'profile.json');

function die(msg) {
  console.error('\nrelease: ' + msg + '\n');
  process.exit(1);
}

// Resolve the Tizen CLI: TIZEN_SDK, the common install dir, or PATH.
function tizenCli() {
  const candidates = [];
  if (process.env.TIZEN_SDK) candidates.push(path.join(process.env.TIZEN_SDK, 'tools', 'ide', 'bin', 'tizen'));
  candidates.push(path.join(os.homedir(), 'tizen-studio', 'tools', 'ide', 'bin', 'tizen'));
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  try { execFileSync('tizen', ['version'], { stdio: 'ignore' }); return 'tizen'; } catch (e) { return null; }
}

// Hard-require both prerequisites up front, before any slow build work.
function preflight() {
  if (!fs.existsSync(PROFILE_JSON)) {
    die('no signing profile at ' + PROFILE_JSON + '.\n' +
        '  Create one first:   npm run cert\n' +
        '  Raw bundles instead: npm run release-unsigned');
  }
  const cli = tizenCli();
  if (!cli) {
    die('the Tizen `tizen` CLI was not found.\n' +
        '  Install the "Tizen TV" VS Code extension (it ships the SDK + CLI), or set TIZEN_SDK.\n' +
        '  See docs/install/tizen.md.');
  }
  return { cli: cli, profile: JSON.parse(fs.readFileSync(PROFILE_JSON, 'utf8')) };
}

function buildHostInstallers() {
  console.log('building Orsay host installers (all targets)…');
  execFileSync('node', [path.join(__dirname, 'bin.js'), '--all'], { stdio: 'inherit' });
}

function buildSignedWgt(cli, profileName) {
  console.log('building + signing Tizen .wgt…');
  const dir = build('tizen');                          // dist/tizen
  execFileSync(cli, ['build-web', '--', dir], { stdio: 'inherit' });
  const built = path.join(dir, '.buildResult');
  execFileSync(cli, ['package', '-t', 'wgt', '-s', profileName, '--', built], { stdio: 'inherit' });
  const wgt = fs.readdirSync(built).find((f) => f.endsWith('.wgt'));
  if (!wgt) die('tizen package produced no .wgt in ' + built);
  const dest = path.join(OUT, 'Twellie.wgt');
  fs.copyFileSync(path.join(built, wgt), dest);
  console.log('  wrote ' + path.relative(ROOT, dest));
}

(function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { cli, profile } = preflight();
  buildHostInstallers();
  buildSignedWgt(cli, profile.name);
  console.log('\nrelease: signed artifacts in dist/release/ (host installers + Twellie.wgt)');
})();
