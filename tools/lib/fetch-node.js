'use strict';
/*
 * tools/lib/fetch-node.js — fetch the OFFICIAL Node runtime binary for a target.
 *
 * We bundle Node's own prebuilt binary from nodejs.org — NOT whatever node is
 * running the build. That matters: the official macOS build is a single
 * statically-linked executable signed "Developer ID Application: Node.js
 * Foundation" with a hardened runtime, and the official Windows node.exe is
 * Authenticode-signed. A Homebrew / nvm / system node is often a *dynamically*
 * linked, ad-hoc-signed build that needs libnode.<n>.dylib & friends — copying
 * just that executable dyld-aborts on the user's machine. So we always pull the
 * real thing, verify its SHA-256 against SHASUMS256.txt, and bundle that.
 *
 * Downloaded archives are cached (extracted binary only) under
 * dist/.node-cache/ so repeat builds are instant and offline.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { ROOT } = require('../build');

const DIST = 'https://nodejs.org/dist';
const CACHE = path.join(ROOT, 'dist', '.node-cache');
const UA = { 'user-agent': 'twellie-build (+https://github.com/nkatchik/smarttv-twitch)' };

// GET that follows redirects, streaming the body to `dest`.
function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: UA }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close((err) => (err ? reject(err) : resolve())));
      file.on('error', reject);
    }).on('error', reject);
  });
}

// GET that follows redirects, buffering the body as text.
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: UA }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchText(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      let s = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { s += d; });
      res.on('end', () => resolve(s));
    }).on('error', reject);
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/*
 * Fetch the official Node binary for { version, os, arch }.
 *   os:   'darwin' | 'win' | 'linux'   (nodejs.org naming)
 *   arch: 'arm64' | 'x64' | 'x86'
 * Returns { data: Buffer, name: 'node'|'node.exe', path: <cached binary> }.
 */
async function fetchNodeBinary(opts) {
  const { version, os, arch } = opts;
  const refresh = !!opts.refresh;
  const tag = 'node-v' + version + '-' + os + '-' + arch;
  const ext = os === 'win' ? '.zip' : '.tar.gz';
  const member = os === 'win' ? tag + '/node.exe' : tag + '/bin/node';
  const name = os === 'win' ? 'node.exe' : 'node';

  fs.mkdirSync(CACHE, { recursive: true });
  const cached = path.join(CACHE, name === 'node.exe' ? tag + '.exe' : tag);
  if (refresh) {
    fs.rmSync(cached, { force: true });
    fs.rmSync(path.join(CACHE, tag + ext), { force: true });
  }
  if (fs.existsSync(cached)) {
    return { data: fs.readFileSync(cached), name: name, path: cached };
  }

  const archive = path.join(CACHE, tag + ext);
  console.log('  fetching official ' + tag + ext + ' from nodejs.org…');
  await download(DIST + '/v' + version + '/' + tag + ext, archive);

  // Verify the download against the project's published checksums.
  const sums = await fetchText(DIST + '/v' + version + '/SHASUMS256.txt');
  const line = sums.split('\n').find((l) => l.trim().endsWith(' ' + tag + ext) || l.trim().endsWith('  ' + tag + ext));
  const want = line && line.trim().split(/\s+/)[0];
  if (!want) throw new Error('no SHASUMS256 entry for ' + tag + ext);
  const got = sha256(archive);
  if (got !== want) throw new Error('sha256 mismatch for ' + tag + ext + ':\n  got  ' + got + '\n  want ' + want);
  console.log('  sha256 verified');

  // Extract just the binary. bsdtar (macOS/Windows) reads .zip too; GNU tar
  // auto-detects gzip — so one `tar -xf` covers every target.
  const tmp = path.join(CACHE, 'x-' + tag);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync('tar', ['-xf', archive, '-C', tmp, member], { stdio: ['ignore', 'ignore', 'inherit'] });

  const data = fs.readFileSync(path.join(tmp, member));
  fs.writeFileSync(cached, data);
  if (name === 'node') fs.chmodSync(cached, 0o755);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(archive, { force: true });
  return { data: data, name: name, path: cached };
}

module.exports = { fetchNodeBinary };
