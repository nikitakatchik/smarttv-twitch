#!/usr/bin/env node
/*
 * Verify and refresh the GitHub-backed TizenBrew module path:
 *   gh/nkatchik/smarttv-twitch
 *
 * TizenBrew fetches https://cdn.jsdelivr.net/<module>/package.json. For this
 * repo, jsDelivr resolves the unversioned GitHub URL to the latest release tag,
 * so the release workflow validates the manifest before publishing and purges
 * jsDelivr after publishing.
 */
'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODULE_SPEC = 'gh/nkatchik/smarttv-twitch';
const CDN_BASE = 'https://cdn.jsdelivr.net/' + MODULE_SPEC + '/';
const PURGE_BASE = 'https://purge.jsdelivr.net/' + MODULE_SPEC + '/';
const pkg = require('../package.json');

function die(message) {
  console.error('tizenbrew module: ' + message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) { die(message); }
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function collectFiles(dir, out) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) { return; }
  fs.readdirSync(full, { withFileTypes: true }).forEach(function (entry) {
    const rel = dir + '/' + entry.name;
    if (entry.isDirectory()) { collectFiles(rel, out); }
    else if (entry.isFile()) { out.push(rel); }
  });
}

function entryLocalRefs(html) {
  const refs = [];
  html.replace(/\b(?:src|href)="([^"]+)"/g, function (_, ref) {
    if (/^(?:https?:|data:|#)/.test(ref)) { return ''; }
    if (ref === '../src/') { return ''; }
    refs.push(ref);
    return '';
  });
  return refs;
}

function check() {
  assert(pkg.packageType === 'app', 'package.json packageType must be "app"');
  assert(pkg.appName === 'Twellie', 'package.json appName must be "Twellie"');
  assert(pkg.appPath === 'tizenbrew/index.html', 'package.json appPath must be "tizenbrew/index.html"');
  assert(Array.isArray(pkg.keys) && pkg.keys.length, 'package.json keys must list Tizen remote keys');
  assert(Array.isArray(pkg.keywords) && pkg.keywords.indexOf('twellie') !== -1, 'package.json keywords must include "twellie"');
  assert(pkg.keywords.indexOf('tizenbrew') !== -1, 'package.json keywords must include "tizenbrew"');

  const appPath = path.join(ROOT, pkg.appPath);
  assert(fs.existsSync(appPath), 'appPath file does not exist: ' + pkg.appPath);

  const html = read(pkg.appPath);
  assert(html.indexOf('<base href="../src/">') !== -1, 'TizenBrew entrypoint must point its base href at ../src/');
  assert(html.indexOf('src="core/app.js"') !== -1, 'TizenBrew entrypoint must load core/app.js');
  assert(html.indexOf('src="platforms/tizenbrew/boot.js"') !== -1, 'TizenBrew entrypoint must load the source-tree TizenBrew boot adapter');

  const base = path.resolve(path.dirname(appPath), '..', 'src');
  entryLocalRefs(html).forEach(function (ref) {
    const target = path.resolve(base, ref);
    assert(target.indexOf(path.join(ROOT, 'src') + path.sep) === 0, 'entrypoint ref escapes src/: ' + ref);
    assert(fs.existsSync(target), 'entrypoint ref is missing: ' + ref);
  });

  console.log('tizenbrew module ok: ' + MODULE_SPEC + ' -> ' + pkg.appPath);
}

function purgeUrl(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (res) {
      res.resume();
      res.on('end', function () {
        if (res.statusCode >= 200 && res.statusCode < 300) { resolve(); }
        else { reject(new Error(url + ' returned HTTP ' + res.statusCode)); }
      });
    }).on('error', reject);
  });
}

function purgePaths() {
  const paths = ['package.json', pkg.appPath];
  collectFiles('src/core', paths);
  collectFiles('src/lang', paths);
  collectFiles('src/platforms/tizenbrew', paths);
  collectFiles('src/ui', paths);
  collectFiles('src/assets', paths);
  return paths.filter(function (file, index) { return paths.indexOf(file) === index; });
}

async function purge() {
  check();
  const paths = purgePaths();
  for (let i = 0; i < paths.length; i++) {
    const url = PURGE_BASE + paths[i];
    await purgeUrl(url);
    console.log('purged ' + CDN_BASE + paths[i]);
  }
  console.log('tizenbrew module CDN purge complete: ' + paths.length + ' path(s)');
}

const arg = process.argv[2] || '--check';

if (arg === '--check') {
  check();
} else if (arg === '--print-spec') {
  console.log(MODULE_SPEC);
} else if (arg === '--purge-cdn') {
  purge().catch(function (err) { die(err.message); });
} else {
  die('unknown argument ' + arg);
}
