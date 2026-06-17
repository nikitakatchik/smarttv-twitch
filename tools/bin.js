#!/usr/bin/env node
/*
 * tools/bin.js — package the Orsay host as a self-contained desktop download.
 *
 *   node tools/bin.js                 ->  build for this machine's OS/arch
 *   node tools/bin.js macos-arm64     ->  cross-build a specific target
 *   node tools/bin.js --all           ->  macos-arm64, macos-x64, windows-x64
 *        ->   dist/release/twellie-orsay-host-<os>-<arch>.zip
 *
 * The package bundles the OFFICIAL Node runtime UNMODIFIED next to our host
 * script — fetched from nodejs.org, NOT copied from whatever node is running
 * this build (that's commonly a Homebrew/nvm build: dynamically linked against
 * libnode.<n>.dylib and only ad-hoc signed, which dyld-aborts when shipped
 * alone). Node's official macOS binary is a single statically-linked executable
 * signed by the Node.js Foundation (Developer ID + hardened runtime) and the
 * Windows node.exe is Authenticode-signed — and because we don't touch the
 * binary (no SEA/postject), it keeps that signature. The user needs nothing
 * installed. See tools/lib/fetch-node.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { build, ROOT } = require('./build');
const { collect, zip } = require('./lib/zip');
const { bundle } = require('./lib/bundle');
const { fetchNodeBinary } = require('./lib/fetch-node');

const OUT = path.join(ROOT, 'dist', 'host-build');
const RELEASE = path.join(ROOT, 'dist', 'release');

// Targets use our public asset names (macos/windows); map to nodejs.org's
// os tokens (darwin/win) when fetching the runtime.
const NODE_OS = { macos: 'darwin', windows: 'win', linux: 'linux' };
const HOST_TARGET =
  ({ darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform] || process.platform) +
  '-' + process.arch;

function parseTargets(argv) {
  const args = argv.slice(2);
  if (args.includes('--all')) return ['macos-arm64', 'macos-x64', 'windows-x64'];
  const explicit = args.filter((a) => !a.startsWith('-'));
  return explicit.length ? explicit : [HOST_TARGET];
}

// The widget + host.js are identical for every target — build them once.
console.log('building Orsay widget…');
const wdir = path.join(OUT, 'widget');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
build('orsay', wdir);
const widget = collect(wdir, '').map((f) => ({ name: f.name, b64: f.data.toString('base64') }));

console.log('bundling host…');
const hostJs = 'var __TWELLIE_WIDGET__ = ' + JSON.stringify(widget) + ';\n' +
  bundle(path.join(__dirname, 'host-bundle.js'));

function winLauncher() {
  return '@echo off\r\ncd /d "%~dp0"\r\nnode.exe host.js %*\r\n';
}
function unixLauncher() {
  // The official Node binary is Developer-ID-signed but NOT notarized, so a
  // copy that came through a browser carries com.apple.quarantine and Gatekeeper
  // SIGKILLs it on launch. Once the user has approved THIS script (right-click →
  // Open), it runs with their permissions and can clear the flag from the whole
  // folder — then node starts with no further prompt.
  // The host serves on port 80 (Orsay's App-Sync field is IP-only, no port box),
  // and binding a port < 1024 needs root on macOS — so re-exec under sudo (one
  // Terminal password prompt) unless we're already root or a high port was passed.
  return '#!/bin/bash\n' +
    'cd "$(dirname "$0")"\n' +
    'xattr -dr com.apple.quarantine . 2>/dev/null || true\n' +
    '# Orsay App-Sync fetches on port 80; binding it needs root on macOS.\n' +
    'if [ "$(id -u)" != 0 ]; then exec sudo ./node host.js "$@"; fi\n' +
    'exec ./node host.js "$@"\n';
}
function winReadme() {
  return 'Twellie installer — for Samsung Orsay TVs (2013-2014)\r\n' +
    '=====================================================\r\n\r\n' +
    'No install needed — this folder is self-contained (it includes Node).\r\n\r\n' +
    'To start it: double-click "Install-Twellie.bat".\r\n' +
    '(node.exe is signed by the OpenJS Foundation, so there is no warning. If\r\n' +
    'SmartScreen ever appears, click "More info" then "Run anyway".)\r\n\r\n' +
    'It prints your computer\'s IP. On the TV, sign in as "develop", set that as\r\n' +
    'the App-Sync server IP, and run Start App Sync to install Twellie.\r\n\r\n' +
    'Then you can CLOSE this window — the TV streams Twitch directly.\r\n\r\n' +
    'Full guide: https://github.com/nkatchik/smarttv-twitch/tree/master/docs/install\r\n';
}
function unixReadme() {
  return 'Twellie installer — for Samsung Orsay TVs (2013-2014)\n' +
    '=====================================================\n\n' +
    'No install needed — this folder is self-contained (it includes Node).\n\n' +
    'To start it: double-click "Install-Twellie.command".\n' +
    'The first time, macOS asks because the launcher isn\'t signed — right-click\n' +
    'it, choose Open, then Open again. It clears the "downloaded from the\n' +
    'internet" flag on the folder and starts. (The bundled node is\n' +
    'Developer-ID-signed by the Node.js Foundation; clearing that flag is what\n' +
    'lets macOS run it without a second prompt.)\n\n' +
    'macOS then asks for your password: the installer serves on port 80 (which the\n' +
    'TV requires), and binding it needs that one-time permission.\n\n' +
    'It prints your computer\'s IP. On the TV, sign in as "develop", set that as\n' +
    'the App-Sync server IP, and run Start App Sync to install Twellie.\n\n' +
    'Then you can CLOSE this window — the TV streams Twitch directly.\n\n' +
    'Full guide: https://github.com/nkatchik/smarttv-twitch/tree/master/docs/install\n';
}

async function packageTarget(target) {
  const dash = target.lastIndexOf('-');
  const osName = target.slice(0, dash);     // macos | windows | linux
  const arch = target.slice(dash + 1);      // arm64 | x64
  const nodeOs = NODE_OS[osName];
  if (!nodeOs) throw new Error('unknown target OS in "' + target + '"');
  const isWin = osName === 'windows';

  // The OFFICIAL, signed, statically-linked Node binary for this target.
  // Same version as the node running the build — guaranteed to exist on the
  // dist server, and matches what we've tested against.
  const node = await fetchNodeBinary({ version: process.versions.node, os: nodeOs, arch: arch });

  // On macOS, prove the fetched binary is the genuine, intact Node.js Foundation
  // build before we ship it (catches a corrupted download / wrong file).
  if (nodeOs === 'darwin' && process.platform === 'darwin') {
    execFileSync('codesign', ['--verify', '--strict', node.path], { stdio: ['ignore', 'ignore', 'inherit'] });
    const desc = spawnSync('codesign', ['-dvvv', node.path], { encoding: 'utf8' }); // codesign prints to stderr
    const auth = ((desc.stderr || '') + (desc.stdout || '')).match(/Authority=Developer ID Application: [^\r\n]+/);
    console.log('  codesign ok — ' + (auth ? auth[0].replace('Authority=', '') : 'Developer ID verified'));
  }

  const files = [
    { name: node.name, data: node.data, mode: 0o100755 },
    { name: 'host.js', data: Buffer.from(hostJs, 'utf8'), mode: 0o100644 },
    { name: isWin ? 'Install-Twellie.bat' : 'Install-Twellie.command',
      data: Buffer.from(isWin ? winLauncher() : unixLauncher(), 'utf8'),
      mode: isWin ? 0o100644 : 0o100755 },
    { name: 'README.txt', data: Buffer.from(isWin ? winReadme() : unixReadme(), 'utf8'), mode: 0o100644 },
  ];

  // DEFLATE here (zlib) so the ~90 MB Node binary ships as a ~30 MB download.
  const zipName = 'twellie-orsay-host-' + osName + '-' + arch + '.zip';
  const buf = zip(files, { deflate: true });
  fs.writeFileSync(path.join(RELEASE, zipName), buf);
  console.log('  wrote dist/release/' + zipName + '  (' + (buf.length / 1048576).toFixed(1) + ' MB)\n');
}

(async function main() {
  fs.mkdirSync(RELEASE, { recursive: true });
  const targets = parseTargets(process.argv);
  for (let i = 0; i < targets.length; i++) {
    console.log('\npackaging ' + targets[i] + ' …');
    await packageTarget(targets[i]);
  }
})().catch((err) => {
  console.error('\nbin.js failed: ' + (err && err.message ? err.message : err));
  process.exit(1);
});
