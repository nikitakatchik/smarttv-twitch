#!/usr/bin/env node
/*
 * tools/tizen-setup.js — download Samsung's CLI-only Tizen SDK into a gitignored
 * project folder (dist/.tizen-sdk/) so `npm run release` can build and sign the
 * Tizen .wgt (for Apps2Samsung) with no system-wide Tizen install.
 *
 *   npm run tizen:setup            download + install into dist/.tizen-sdk/
 *   npm run tizen:setup -- --check verify prerequisites + print the plan, no download
 *   npm run tizen:setup -- --force reinstall over an existing local SDK
 *
 * Footprint: ~311 MB download, ~1.5-2 GB installed, ALL under dist/.tizen-sdk/
 * (remove with `rm -rf dist/.tizen-sdk`). Two things Samsung's tooling won't keep
 * inside that folder:
 *   - Rosetta 2 — the SDK is Intel-only (no arm64 build), so it runs under Rosetta
 *     on Apple Silicon. This script NEVER installs it; if it's missing it stops and
 *     prints the one-liner for you to run.
 *   - a couple of tiny dotfiles the official installer/sdb drop in $HOME
 *     (~/.package-manager logs, ~/.sdb device keys).
 * No Samsung account or DUID is needed here: `npm run release` signs the .wgt
 * with a throwaway GENERIC cert, and Apps2Samsung re-signs it per-TV at install
 * time (see docs/install/apps2samsung.md).
 *
 * Verified 2026-06: web-cli_Tizen_SDK_10.0_macos-64.bin -> HTTP 200, 326,076,958 bytes
 * (download.tizen.org). Flags/footprint per Samsung/tizen-docs + samsungtizenos.com.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { resolve: resolveTizen, LOCAL_SDK_DIR, LOCAL_SDK_ROOT, ENV_JSON } = require('./lib/tizen-env');

const BASE = 'https://download.tizen.org/sdk/Installer/tizen-sdk_10.0/';
// Exact installer byte sizes from the official mirror (used as an integrity check).
const INSTALLERS = {
  darwin: { file: 'web-cli_Tizen_SDK_10.0_macos-64.bin', size: 326076958, selfExtract: true },
  linux: { file: 'web-cli_Tizen_SDK_10.0_ubuntu-64.bin', size: 401290863, selfExtract: true },
  win32: { file: 'web-cli_Tizen_SDK_10.0_windows-64.exe', size: 373556224, selfExtract: false },
};

const CHECK = process.argv.includes('--check') || process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
// --ensure: silent no-op if ANY Tizen CLI is already resolvable; otherwise
// install. Lets a caller depend on the SDK being present before packaging a .wgt.
const ENSURE = process.argv.includes('--ensure');

function die(msg) { console.error('\ntizen:setup: ' + msg + '\n'); process.exit(1); }
function mb(bytes) { return Math.round(bytes / 1048576); }

// Is Rosetta 2 installed? (Apple Silicon only — the SDK is x86_64.)
function rosettaPresent() {
  if (fs.existsSync('/Library/Apple/usr/libexec/oah/libRosettaRuntime')) return true;
  if (fs.existsSync('/Library/Apple/usr/libexec/oah')) return true;
  try { execFileSync('/usr/bin/arch', ['-x86_64', '/usr/bin/true'], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

// Streaming download with redirect-following and a simple percent meter.
function download(url, dest) {
  return new Promise(function (res, rej) {
    https.get(url, { headers: { 'user-agent': 'twellie-tizen-setup' } }, function (r) {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return download(r.headers.location, dest).then(res, rej);
      }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode + ' for ' + url)); }
      const total = parseInt(r.headers['content-length'] || '0', 10);
      const file = fs.createWriteStream(dest);
      let seen = 0, lastPct = -1;
      r.on('data', function (c) {
        seen += c.length;
        if (total) {
          const p = Math.floor((seen / total) * 100);
          if (p !== lastPct && p % 5 === 0) { lastPct = p; process.stdout.write('\r  downloading… ' + p + '%   '); }
        }
      });
      r.pipe(file);
      file.on('finish', function () { process.stdout.write('\n'); file.close(function (e) { return e ? rej(e) : res(); }); });
      file.on('error', rej);
    }).on('error', rej);
  });
}

(async function main() {
  const plat = process.platform;
  const inst = INSTALLERS[plat];
  if (!inst) die('unsupported platform "' + plat + '" (macOS, Linux, or Windows x64 only).');

  const existing = resolveTizen();
  if (ENSURE && existing) return; // dependency already satisfied (local / $TIZEN_SDK / ~/tizen-studio / PATH) — stay quiet
  if (existing && existing.source === 'local' && !FORCE) {
    console.log('tizen:setup: local SDK already installed.');
    console.log('  ' + existing.tizen);
    console.log('  (re-run with --force to reinstall, or `rm -rf dist/.tizen-sdk`)');
    return;
  }

  const appleSilicon = plat === 'darwin' && process.arch === 'arm64';
  const hasRosetta = appleSilicon ? rosettaPresent() : true;
  if (appleSilicon && !hasRosetta && !CHECK) {
    die('the Tizen SDK is Intel-only and needs Rosetta 2, which is not installed.\n' +
        '  Run this once (it is the only OS-level step), then re-run `npm run tizen:setup`:\n' +
        '    softwareupdate --install-rosetta --agree-to-license');
  }

  if (CHECK) {
    console.log('tizen:setup --check');
    console.log('  platform     : ' + plat + '/' + process.arch);
    console.log('  installer    : ' + BASE + inst.file + '  (' + mb(inst.size) + ' MB)');
    console.log('  install into : ' + LOCAL_SDK_ROOT + '  (gitignored)');
    if (appleSilicon) {
      console.log('  rosetta 2    : ' + (hasRosetta ? 'present' :
        'MISSING — run: softwareupdate --install-rosetta --agree-to-license'));
    }
    console.log('  (no download performed; drop --check to install)');
    return;
  }

  if (!inst.selfExtract) {
    die('automated install is not wired for Windows. Download:\n  ' + BASE + inst.file +
        '\nthen run:  ' + inst.file + ' --accept-license ' + LOCAL_SDK_ROOT);
  }

  fs.mkdirSync(LOCAL_SDK_DIR, { recursive: true });
  const installerPath = path.join(LOCAL_SDK_DIR, inst.file);

  // Download (skip a correctly-sized cached copy).
  if (!fs.existsSync(installerPath) || fs.statSync(installerPath).size !== inst.size) {
    console.log('fetching ' + inst.file + ' (' + mb(inst.size) + ' MB) from download.tizen.org…');
    await download(BASE + inst.file, installerPath);
  } else {
    console.log('using cached ' + inst.file);
  }
  const got = fs.statSync(installerPath).size;
  if (got !== inst.size) die('size mismatch (' + got + ' != ' + inst.size + '); delete ' + installerPath + ' and retry.');

  // Headless install into the project-local folder (data sibling lands beside it).
  console.log('installing into ' + LOCAL_SDK_ROOT + ' — extracts ~1.5 GB, takes a few minutes…');
  fs.chmodSync(installerPath, 0o755);
  execFileSync(installerPath, ['--accept-license', '--no-java-check', LOCAL_SDK_ROOT], { stdio: 'inherit' });

  const env = resolveTizen();
  if (!env || env.source !== 'local') {
    die('install finished but the `tizen` CLI was not found under ' + LOCAL_SDK_ROOT + '.\n' +
        '  Inspect the layout:  find ' + LOCAL_SDK_DIR + ' -name tizen -o -name tz');
  }
  fs.writeFileSync(ENV_JSON, JSON.stringify(
    { sdkRoot: env.sdkRoot, tizen: env.tizen, tz: env.tz, sdb: env.sdb, pkgMgr: env.pkgMgr }, null, 2) + '\n');
  console.log('wrote ' + path.relative(process.cwd(), ENV_JSON));

  try { execFileSync(env.tizen, ['version'], { stdio: 'inherit' }); }
  catch (e) { console.log('  (warning: `tizen version` failed — check Rosetta / the install log)'); }

  console.log('\ntizen:setup: done. SDK is in dist/.tizen-sdk/  (rm -rf dist/.tizen-sdk to remove).');
  console.log('Note: a few small files may also appear in $HOME (~/.package-manager logs, ~/.sdb) —');
  console.log('the official installer puts them there; they are harmless.');
  console.log('\nNEXT STEPS:');
  console.log('  1. npm run release        # builds + signs dist/release/Twellie.wgt (generic cert)');
  console.log('  2. Install with Apps2Samsung — it re-signs the .wgt for your TV automatically:');
  console.log('     https://github.com/Apps2Samsung/Apps2Samsung  → pick "Custom WGT" → Twellie.wgt');
  console.log('  No Samsung account or DUID needed here. (TizenBrew is an alternative, SDK-free');
  console.log('  path: npm run build:tizenbrew.) See docs/install/apps2samsung.md.');
})().catch(function (e) { die(e && e.message ? e.message : String(e)); });
