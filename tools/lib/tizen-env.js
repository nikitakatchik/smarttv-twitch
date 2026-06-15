'use strict';
/*
 * tools/lib/tizen-env.js — locate a Tizen CLI toolchain for release.js /
 * tizen-setup.js, so they resolve the same binaries the same way.
 *
 * Preference order:
 *   1. the project-local SDK installed by `npm run tizen:setup` (dist/.tizen-sdk/)
 *   2. an explicit $TIZEN_SDK install
 *   3. a default ~/tizen-studio install
 *   4. `tizen` already on PATH
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const LOCAL_SDK_DIR = path.join(ROOT, 'dist', '.tizen-sdk');     // gitignored (under dist/)
const LOCAL_SDK_ROOT = path.join(LOCAL_SDK_DIR, 'tizen-studio'); // the SDK itself
const ENV_JSON = path.join(LOCAL_SDK_DIR, 'tizen-env.json');     // written by tizen-setup

// Build the CLI paths for a given SDK root (the layout is stable across installs).
function fromSdkRoot(root, source) {
  return {
    source: source,
    sdkRoot: root,
    tizen: path.join(root, 'tools', 'ide', 'bin', 'tizen'),
    tz: path.join(root, 'tools', 'tizen-core', 'tz'),
    sdb: path.join(root, 'tools', 'sdb'),
    pkgMgr: path.join(root, 'package-manager', 'package-manager-cli.bin'),
  };
}

// Returns { source, sdkRoot, tizen, tz, sdb, pkgMgr } or null if no CLI is found.
function resolve() {
  // 1. env.json written by tizen-setup (authoritative; tolerates layout drift)
  if (fs.existsSync(ENV_JSON)) {
    try {
      const e = JSON.parse(fs.readFileSync(ENV_JSON, 'utf8'));
      if (e.tizen && fs.existsSync(e.tizen)) return Object.assign({ source: 'local' }, e);
    } catch (err) { /* fall through to layout probing */ }
  }
  // 2. project-local SDK, default layout
  if (fs.existsSync(path.join(LOCAL_SDK_ROOT, 'tools', 'ide', 'bin', 'tizen'))) {
    return fromSdkRoot(LOCAL_SDK_ROOT, 'local');
  }
  // 3. $TIZEN_SDK
  if (process.env.TIZEN_SDK && fs.existsSync(path.join(process.env.TIZEN_SDK, 'tools', 'ide', 'bin', 'tizen'))) {
    return fromSdkRoot(process.env.TIZEN_SDK, 'env');
  }
  // 4. ~/tizen-studio
  const home = path.join(os.homedir(), 'tizen-studio');
  if (fs.existsSync(path.join(home, 'tools', 'ide', 'bin', 'tizen'))) {
    return fromSdkRoot(home, 'home');
  }
  // 5. on PATH
  try {
    execFileSync('tizen', ['version'], { stdio: 'ignore' });
    return { source: 'path', sdkRoot: null, tizen: 'tizen', tz: 'tz', sdb: 'sdb', pkgMgr: null };
  } catch (e) { /* not found */ }
  return null;
}

module.exports = { resolve: resolve, ROOT: ROOT, LOCAL_SDK_DIR: LOCAL_SDK_DIR, LOCAL_SDK_ROOT: LOCAL_SDK_ROOT, ENV_JSON: ENV_JSON };
