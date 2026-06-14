#!/usr/bin/env node
/*
 * tools/cert.js — create the Samsung TV signing profile used by `npm run release`.
 *
 * Everything lives under ~/Documents/Dev/SamsungTV so the signing material stays
 * with the project, not buried in the default SDK data dir.
 *
 * A Tizen .wgt for a real Samsung TV needs TWO certs:
 *   1. a Samsung AUTHOR cert     — created here via the `tizen` CLI, and
 *   2. a Samsung DISTRIBUTOR cert — issued by Samsung and bound to your TV DUIDs.
 *      Samsung only mints it through the Certificate Manager GUI (account sign-in),
 *      so this script registers the profile + author cert and then prints the exact
 *      one-time GUI step and how to add your TV's DUID.
 *
 * The keystore password defaults to EMPTY (password-less). A Tizen .p12 always has
 * a password field, but it is not a security boundary for a local dev signing cert —
 * it is stored in your signing profile so `npm run release` signs without prompting,
 * so you never type it. Pass --password only if you want one (or your SDK rejects an
 * empty password).
 *
 * Usage:
 *   npm run cert -- [--name twellie] [--password <pw>] [--duid <TV-DUID>]
 *   (or env: TIZEN_CERT_NAME / TIZEN_CERT_PASSWORD / TIZEN_TV_DUID)
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CERT_DIR = path.join(os.homedir(), 'Documents', 'Dev', 'SamsungTV');

function arg(flag, env, def) {
  const i = process.argv.indexOf(flag);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (env && process.env[env]) return process.env[env];
  return def;
}
function die(msg) { console.error('\ncert: ' + msg + '\n'); process.exit(1); }

function tizenCli() {
  if (process.env.TIZEN_SDK) {
    const c = path.join(process.env.TIZEN_SDK, 'tools', 'ide', 'bin', 'tizen');
    if (fs.existsSync(c)) return c;
  }
  const home = path.join(os.homedir(), 'tizen-studio', 'tools', 'ide', 'bin', 'tizen');
  if (fs.existsSync(home)) return home;
  try { execFileSync('tizen', ['version'], { stdio: 'ignore' }); return 'tizen'; } catch (e) { return null; }
}

const name = arg('--name', 'TIZEN_CERT_NAME', 'twellie');
const password = arg('--password', 'TIZEN_CERT_PASSWORD', ''); // default: password-less keystore
const duid = arg('--duid', 'TIZEN_TV_DUID', null);

const cli = tizenCli();
if (!cli) {
  die('the Tizen `tizen` CLI was not found.\n' +
      '  Install the "Tizen TV" VS Code extension (it ships the SDK + CLI), or set TIZEN_SDK.');
}

fs.mkdirSync(CERT_DIR, { recursive: true });
const authorP12 = path.join(CERT_DIR, name + '-author.p12');

console.log('creating author certificate -> ' + authorP12 + (password ? '' : ' (password-less)'));
try {
  execFileSync(cli, ['certificate', '-a', name, '-p', password, '-f', name + '-author', '--', CERT_DIR], { stdio: 'inherit' });
} catch (e) {
  if (!password) {
    die('the Tizen CLI rejected an empty keystore password.\n' +
        '  Re-run with one — it is stored in the profile, so you still never type it when signing:\n' +
        '    npm run cert -- --password <any-value>');
  }
  throw e;
}

console.log('registering security profile "' + name + '"…');
execFileSync(cli, ['security-profiles', 'add', '-n', name, '-a', authorP12, '-p', password], { stdio: 'inherit' });

fs.writeFileSync(path.join(CERT_DIR, 'profile.json'),
  JSON.stringify({ name: name, certDir: CERT_DIR }, null, 2) + '\n');

console.log('\ncert: author cert + profile "' + name + '" stored in ' + CERT_DIR);
console.log('\nNEXT — add the Samsung DISTRIBUTOR cert (one-time, GUI):');
console.log('  1. VS Code: run "Tizen TV: Run Certificate Manager".');
console.log('  2. Edit the "' + name + '" profile and add a SAMSUNG distributor cert');
console.log('     (sign in with your Samsung account).');
console.log('  3. Register your TV\'s DUID' + (duid ? ' (' + duid + ')' : '') +
            ' so the signed .wgt installs on it.');
console.log('\nThen:  npm run release');
