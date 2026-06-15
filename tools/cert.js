#!/usr/bin/env node
/*
 * tools/cert.js — mint the Samsung TV signing certs and register a signing
 * profile, with NO GUI and NO Certificate Manager. `npm run release` then signs
 * against it.
 *
 * A retail Samsung TV (2018+) only installs a .wgt whose distributor signature
 * is a Samsung VD distributor cert bound to that TV's DUID — the SDK's bundled
 * generic cert is rejected (`install failed [118, -12]`). This script gets a
 * real Samsung author + DUID distributor cert the headless way (see
 * tools/lib/samsung-cert.js for the reverse-engineered protocol).
 *
 * The ONE interactive step is a Samsung-account login: the CA issues only
 * against an account OAuth token and offers no password grant, so a browser
 * login happens once (token is never stored). Three ways to supply it:
 *
 *   default   open the login page; a one-shot loopback catcher on 127.0.0.1:4794
 *             grabs the redirect and closes immediately (not a standing server).
 *   --paste   print the login URL, you log in, then paste the localhost redirect
 *             URL from the browser bar back here. Nothing listens.
 *   env       SAMSUNG_ACCESS_TOKEN (+ SAMSUNG_USER_ID) for fully non-interactive
 *             / CI use — bring your own token.
 *
 * Usage:
 *   npm run cert -- --duid <TV-DUID>[,<DUID2>...] [--email you@x.com]
 *                   [--name twellie] [--privilege public|partner]
 *                   [--password <pw>] [--paste] [--refresh-ca]
 *   (env: TIZEN_TV_DUID / TIZEN_CERT_EMAIL / TIZEN_CERT_NAME / TIZEN_CERT_PASSWORD)
 *
 * The DUID is on the TV at Menu > Support > Contact Samsung (or auto-read over
 * sdb if a dev-mode TV is connected). Certs land in ~/Documents/Dev/SamsungTV.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const tizenEnv = require('./lib/tizen-env');
const sc = require('./lib/samsung-cert');

const CERT_DIR = path.join(os.homedir(), 'Documents', 'Dev', 'SamsungTV');
const CA_DIR = path.join(CERT_DIR, 'ca');

function arg(flag, env, def) {
  const i = process.argv.indexOf(flag);
  if (i !== -1 && process.argv[i + 1] && process.argv[i + 1][0] !== '-') return process.argv[i + 1];
  if (env && process.env[env]) return process.env[env];
  return def;
}
function has(flag) { return process.argv.indexOf(flag) !== -1; }
function die(msg) { console.error('\ncert: ' + msg + '\n'); process.exit(1); }

const name = arg('--name', 'TIZEN_CERT_NAME', 'twellie');
const password = arg('--password', 'TIZEN_CERT_PASSWORD', ''); // password-less keystore by default
const privilege = (arg('--privilege', 'TIZEN_CERT_PRIVILEGE', 'public') || 'public').toLowerCase();
const emailArg = arg('--email', 'TIZEN_CERT_EMAIL', null);
const duidArg = arg('--duid', 'TIZEN_TV_DUID', null);
const cfg = sc.PINNED;

if (privilege !== 'public' && privilege !== 'partner' && privilege !== 'platform') {
  die('unknown --privilege "' + privilege + '" (use public, partner, or platform).');
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch (e) { /* user opens manually */ }
}

function promptLine(q) {
  return new Promise(function (res) {
    process.stdout.write(q);
    process.stdin.resume();
    process.stdin.once('data', function (d) { process.stdin.pause(); res(String(d).trim()); });
  });
}

// Read the DUID of EVERY dev-mode TV currently connected over sdb. The device
// command is the duid-gadget binary (verified against the official Certificate
// Manager — 'getduidgadget' does not exist). Best-effort; returns [] if none.
function autoDuids() {
  const env = tizenEnv.resolve();
  if (!env || !env.sdb) return [];
  let serials = [];
  try {
    const list = execFileSync(env.sdb, ['devices'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).toString();
    serials = list.split('\n').slice(1)                       // drop "List of devices attached"
      .map(function (l) { return l.trim().split(/\s+/)[0]; })
      .filter(function (s) { return s && s.toLowerCase() !== 'list'; });
  } catch (e) { return []; }
  const out = [];
  serials.forEach(function (serial) {
    try {
      const r = execFileSync(env.sdb, ['-s', serial, 'shell', '/opt/etc/duid-gadget 2.0'],
        { stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).toString();
      const m = r.match(/[0-9A-Za-z][0-9A-Za-z#._-]{15,}/);
      if (m && out.indexOf(m[0]) === -1) out.push(m[0]);
    } catch (e) { /* skip this device */ }
  });
  return out;
}

// Resolve a Samsung-account token by the chosen method. Returns {accessToken,userId}.
async function getToken() {
  if (process.env.SAMSUNG_ACCESS_TOKEN) {
    const t = sc.parseToken({ access_token: process.env.SAMSUNG_ACCESS_TOKEN, userId: process.env.SAMSUNG_USER_ID || emailArg });
    if (!t) die('SAMSUNG_ACCESS_TOKEN is set but SAMSUNG_USER_ID (your Samsung account id/email) is missing.');
    console.log('using token from environment.');
    return t;
  }
  const url = sc.buildAuthUrl(cfg, sc.redirectUri(cfg));
  if (has('--paste')) {
    // Samsung delivers the token in the callback POST body (a JSON `code`), NOT in
    // the address bar — so a plain browser-bar copy won't contain it. This path
    // only works if you capture that POST body yourself; the default loopback
    // catcher is the reliable route.
    console.log('\nNOTE: the token arrives in the callback POST body, not the URL bar — the default');
    console.log('(loopback catcher) is the reliable path. --paste needs you to capture the callback');
    console.log('POST body via browser devtools (Network > /signin/callback > the "code" value).\n');
    console.log('Sign in here:\n   ' + url + '\n');
    const pasted = await promptLine('paste the callback "code" JSON (or full token JSON) > ');
    const t = sc.parseToken(pasted);
    if (!t) die('could not read a token from that — it must contain access_token and a user id.');
    return t;
  }
  console.log('\nopening Samsung account login in your browser…');
  console.log('(a one-shot catcher on 127.0.0.1:4794 will grab the redirect and close — not a standing server)');
  console.log('if no browser opens, visit:\n   ' + url + '\n');
  return sc.captureToken(cfg, { onUrl: openBrowser });
}

function mint(openssl, kind, subject, san, url, fields, caCertPath, token) {
  console.log('  • ' + kind + ': key + CSR…');
  const k = sc.genKeyAndCsr(openssl, CERT_DIR, name + '-' + kind, subject, san);
  console.log('  • ' + kind + ': requesting Samsung signature…');
  return sc.postCsr(url, k.csrPath, Object.assign({ accessToken: token.accessToken, userId: token.userId, platform: 'VD' }, fields))
    .then(function (resp) {
      if (resp.status < 200 || resp.status >= 300 || !sc.looksLikeCert(resp.body)) {
        const snippet = resp.body.toString('utf8').slice(0, 400).replace(/\s+/g, ' ');
        die('Samsung CA rejected the ' + kind + ' request (HTTP ' + resp.status + ').\n  ' + snippet +
            '\n  (token expired? wrong DUID format? endpoint moved? try --refresh-ca)');
      }
      const p12 = path.join(CERT_DIR, name + '-' + kind + '.p12');
      sc.assembleP12(openssl, CERT_DIR, name + '-' + kind, resp.body, caCertPath, k.keyPath, p12, password);
      console.log('  • ' + kind + ': ' + path.relative(os.homedir(), p12) + (password ? '' : ' (password-less)'));
      return p12;
    });
}

(async function main() {
  const openssl = 'openssl';
  try { execFileSync(openssl, ['version'], { stdio: 'ignore' }); }
  catch (e) { die('openssl not found on PATH — install it (macOS: it ships with the system; or `brew install openssl`).'); }

  let duids = (duidArg ? duidArg.split(',') : []).map(function (s) { return s.trim(); }).filter(Boolean);
  if (!duids.length) {
    const auto = autoDuids();
    if (auto.length) { duids = auto; console.log('read DUID(s) from connected TV(s): ' + duids.join(', ')); }
  }
  if (!duids.length) {
    die('no TV DUID. The distributor cert is bound to it.\n' +
        '  Find it on the TV: Menu > Support > Contact Samsung (Unique Device ID),\n' +
        '  then:  npm run cert -- --duid <DUID>[,<DUID2>...]\n' +
        '  (or connect a dev-mode TV over sdb and it is read automatically).');
  }

  fs.mkdirSync(CERT_DIR, { recursive: true });

  console.log('fetching Samsung VD CA chain…');
  await sc.ensureCaCerts(CA_DIR, { refresh: has('--refresh-ca') });
  const authorCa = path.join(CA_DIR, cfg.vdAuthorCa);
  const distCa = path.join(CA_DIR, cfg.vdDistCa[privilege]);
  if (!fs.existsSync(authorCa) || !fs.existsSync(distCa)) {
    die('VD CA certs missing under ' + CA_DIR + ' — re-run with --refresh-ca.');
  }

  const token = await getToken();
  const email = emailArg || token.userId;
  console.log('\nminting Samsung VD certs for DUID(s): ' + duids.join(', ') + '  (privilege: ' + privilege + ')');

  const authorP12 = await mint(openssl, 'author', '/CN=' + email + '/O=Tizen', null,
    cfg.authorUrl, {}, authorCa, token);

  // The v3 distributor flow binds DUIDs SERVER-SIDE: the official client sends an
  // EMPTY CSR (no subjectAltName / no deviceid), so we do NOT embed the DUID in the
  // CSR (the old v2 SAN trick produces a non-installable cert -> install [118,-12]).
  // The exact channel by which v3 receives the DUID is not yet reverse-engineered;
  // the server's response below is what will reveal it.
  console.log('\nNOTE: v3 binds DUIDs server-side; the issued distributor cert may not yet be scoped to');
  console.log('your DUID(s) [' + duids.join(', ') + '] — the CA response tells us. (Author cert is unaffected.)');
  const distP12 = await mint(openssl, 'distributor', '/CN=' + name + '/O=Tizen', null,
    cfg.distributorUrl,
    { privilegeLevel: privilege.charAt(0).toUpperCase() + privilege.slice(1), developerType: 'Individual' },
    distCa, token);

  // Register a tizen signing profile (author + distributor) if the CLI is around.
  let registered = false;
  const env = tizenEnv.resolve();
  if (env && env.tizen) {
    try {
      console.log('\nregistering signing profile "' + name + '"…');
      execFileSync(env.tizen, ['security-profiles', 'add', '-n', name,
        '-a', authorP12, '-p', password, '-d', distP12, '-dp', password], { stdio: 'inherit' });
      registered = true;
    } catch (e) {
      console.log('  (could not auto-register via the tizen CLI — release.js will still find the certs below)');
    }
  }

  fs.writeFileSync(path.join(CERT_DIR, 'profile.json'), JSON.stringify({
    name: name, certDir: CERT_DIR, privilege: privilege, duids: duids,
    authorP12: authorP12, distributorP12: distP12, registered: registered,
  }, null, 2) + '\n');

  console.log('\ncert: done. Samsung VD author + distributor certs for DUID(s) ' + duids.join(', ') + ' in ' + CERT_DIR);
  console.log('  next:  npm run release      # builds + signs dist/release/Twellie.wgt');
  console.log('\nNote: the distributor cert is bound to those DUIDs and expires (Samsung VD certs ~2y,');
  console.log('and the VD distributor CA itself expires 2029-06) — re-run this and re-install when it lapses.');
})().catch(function (e) { die(e && e.message ? e.message : String(e)); });
