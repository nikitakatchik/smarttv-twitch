#!/usr/bin/env node
/*
 * tools/version.js — keep repo version fields in sync.
 *
 *   node tools/version.js 4.1.0     update package.json + Tizen config.xml
 *   node tools/version.js --check   verify both files agree
 *   node tools/version.js --print   print package.json version
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_FILE = path.join(ROOT, 'package.json');
const TIZEN_CONFIG = path.join(ROOT, 'src', 'platforms', 'tizen', 'config.xml');
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

function die(message) {
  console.error('version: ' + message);
  process.exit(1);
}

function usage() {
  console.log([
    'Usage:',
    '  node tools/version.js <x.y.z>',
    '  node tools/version.js --check',
    '  node tools/version.js --print',
  ].join('\n'));
}

function validateVersion(version) {
  if (!VERSION_RE.test(version)) {
    die('version must use dotted numeric x.y.z form, got ' + JSON.stringify(version));
  }
}

function readPackage() {
  return JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
}

function writePackage(version) {
  const pkg = readPackage();
  pkg.version = version;
  fs.writeFileSync(PKG_FILE, JSON.stringify(pkg, null, 2) + '\n');
}

function readTizenVersion() {
  const xml = fs.readFileSync(TIZEN_CONFIG, 'utf8');
  const match = xml.match(/<widget\b[\s\S]*?\bversion="([^"]+)"/);
  if (!match) { die('could not find widget version in ' + path.relative(ROOT, TIZEN_CONFIG)); }
  return match[1];
}

function writeTizenVersion(version) {
  const oldXml = fs.readFileSync(TIZEN_CONFIG, 'utf8');
  let replaced = 0;
  const newXml = oldXml.replace(/(<widget\b[\s\S]*?\bversion=")([^"]+)(")/, function (_, before, oldVersion, after) {
    replaced += 1;
    return before + version + after;
  });
  if (replaced !== 1) { die('could not update widget version in ' + path.relative(ROOT, TIZEN_CONFIG)); }
  fs.writeFileSync(TIZEN_CONFIG, newXml);
}

function check() {
  const pkgVersion = readPackage().version;
  const tizenVersion = readTizenVersion();
  validateVersion(pkgVersion);
  if (pkgVersion !== tizenVersion) {
    die('package.json version ' + pkgVersion + ' does not match Tizen config.xml version ' + tizenVersion);
  }
  console.log('version ok: ' + pkgVersion);
}

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === '--print') {
  const version = readPackage().version;
  validateVersion(version);
  console.log(version);
} else if (args.length === 1 && args[0] === '--check') {
  check();
} else if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
  usage();
} else if (args.length === 1) {
  validateVersion(args[0]);
  writePackage(args[0]);
  writeTizenVersion(args[0]);
  console.log('version updated: ' + args[0]);
} else {
  usage();
  process.exit(1);
}
