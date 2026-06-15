#!/usr/bin/env node
/*
 * tools/publish.js — cut (or update) a GitHub Release with the install artifacts,
 * each attached under a human-friendly LABEL (gh's `<file>#<label>` syntax).
 *
 *   npm run publish               build assets + create a DRAFT release (review on GitHub)
 *   npm run publish -- --live     create/promote a PUBLISHED release
 *   npm run publish -- --dry-run  show the asset/label map + the gh plan; build/publish nothing
 *
 * PUSH THE TAG FIRST. The release attaches to tag v<version> (override RELEASE_TAG),
 * and we pass gh --verify-tag so it never silently auto-tags the wrong commit:
 *     git tag v4.0.0 && git push origin v4.0.0        # then: npm run publish
 * (or set GH_TARGET=<sha> to let gh create the tag at that commit.)
 *
 * IDEMPOTENT: if a release for the tag already exists, publish UPDATES it
 * (edit notes/title + re-upload assets with --clobber) instead of failing — so the
 * documented draft → `--live` promotion works, and CI job re-runs are safe.
 *
 * Publishing is outward-facing and hard to undo, so it DEFAULTS TO A DRAFT.
 * Requires the `gh` CLI, authenticated (`gh auth login`, or GH_TOKEN in CI).
 *
 * Assets (Tizen .wgt needs the Tizen CLI — release.js auto-fetches it; the three
 * Orsay host installers are cross-built by bin.js, or reused from a CI matrix):
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pkg = require('../package.json');
const { buildTizenbrew, ROOT } = require('./build');
const { zipDir } = require('./lib/zip');

const OUT = path.join(ROOT, 'dist', 'release');
// Tag: v<version> by default; RELEASE_TAG lets CI pin it to the pushed tag.
const TAG = process.env.RELEASE_TAG || ('v' + pkg.version);
const DRY = process.argv.includes('--dry-run');
const LIVE = process.argv.includes('--live');

// [ filename, release label ] — the published set, in display order.
const ASSETS = [
  ['twellie-orsay.zip', 'Orsay — app widget (2013–2014, F·H)'],
  ['twellie-orsay-host-windows-x64.zip', 'Orsay — Windows installer (64-bit)'],
  ['twellie-orsay-host-macos-x64.zip', 'Orsay — macOS installer (Intel)'],
  ['twellie-orsay-host-macos-arm64.zip', 'Orsay — macOS installer (Apple Silicon)'],
  ['Twellie.wgt', 'Tizen — Apps2Samsung package (.wgt, 2015+)'],
  ['twellie-tizenbrew.zip', 'Tizen — TizenBrew module (2017+)'],
];
const HOST_ZIPS = ASSETS.map(function (a) { return a[0]; }).filter(function (n) { return n.indexOf('-host-') !== -1; });

function die(m) { console.error('\npublish: ' + m + '\n'); process.exit(1); }
function exists(name) { return fs.existsSync(path.join(OUT, name)); }
function run(cmd, args) { execFileSync(cmd, args, { stdio: 'inherit' }); }
// Run a build step but never let one failure abort the whole release.
function step(label, fn) {
  try { fn(); } catch (e) { console.log('  WARNING: ' + label + ' failed — ' + (e && e.message ? e.message : e)); }
}
function assetArg(asset) { return path.join(OUT, asset[0]) + '#' + asset[1]; }

function notes() {
  return [
    'Pick the asset for your TV generation:',
    '',
    '- **Orsay (2013–2014, F·H):** run the installer for your computer (Windows / macOS Intel /',
    '  macOS Apple Silicon), then App-Sync. The raw *app widget* zip is for self-hosting.',
    '- **Tizen (2015+):** install `Twellie.wgt` with [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung)',
    '  — it signs it for your TV automatically. Or load the **TizenBrew module** (2017+).',
    '',
    'Full guides are in the repository README.',
  ].join('\n');
}

function buildAssets() {
  console.log('building release artifacts…');
  step('Orsay/web zips + Twellie.wgt', function () { run('node', [path.join(__dirname, 'release.js')]); });
  // Reuse host installers ONLY when a CI matrix just gathered fresh ones; locally
  // always rebuild, since stale zips from a previous run would otherwise ship.
  if (process.env.CI && HOST_ZIPS.every(exists)) {
    console.log('  (reusing host installers gathered by the CI matrix)');
  } else {
    step('Orsay host installers', function () { run('node', [path.join(__dirname, 'bin.js'), '--all']); });
  }
  step('TizenBrew module zip', function () {
    fs.writeFileSync(path.join(OUT, 'twellie-tizenbrew.zip'), zipDir(buildTizenbrew()));
    console.log('  twellie-tizenbrew.zip');
  });
}

function releaseExists() {
  try { execFileSync('gh', ['release', 'view', TAG], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

// Create the release, or update it in place if it already exists (idempotent).
function publishRelease(present) {
  const assets = present.map(assetArg);
  if (releaseExists()) {
    console.log('release ' + TAG + ' already exists — updating it…');
    const edit = ['release', 'edit', TAG, '--title', 'Twellie ' + TAG, '--notes', notes()];
    if (LIVE) { edit.push('--draft=false'); }           // promote a draft to published
    run('gh', edit);
    run('gh', ['release', 'upload', TAG].concat(assets).concat(['--clobber']));
  } else {
    const create = ['release', 'create', TAG, '--title', 'Twellie ' + TAG, '--notes', notes()];
    if (!LIVE) { create.push('--draft'); }
    // Pin the tag to a real revision: a pushed tag (--verify-tag, default) or an
    // explicit commit (GH_TARGET) — never gh's silent auto-tag of the default branch.
    if (process.env.GH_TARGET) { create.push('--target', process.env.GH_TARGET); }
    else { create.push('--verify-tag'); }
    try {
      run('gh', create.concat(assets));
    } catch (e) {
      die('`gh release create ' + TAG + '` failed. If it is a "tag does not exist" error, push the tag first:\n' +
          '    git tag ' + TAG + ' && git push origin ' + TAG + '\n' +
          '  (or set GH_TARGET=<commit-sha>).');
    }
  }
}

if (DRY) {
  console.log('publish --dry-run — tag ' + TAG + (LIVE ? ' (live)' : ' (draft)') + '\n');
  console.log('assets + labels:');
  ASSETS.forEach(function (a) {
    console.log('  ' + (exists(a[0]) ? '✓' : '·') + ' ' + a[0] + '  →  "' + a[1] + '"');
  });
  const create = ['gh', 'release', 'create', TAG, '--title', 'Twellie ' + TAG, '--notes', '<notes>']
    .concat(LIVE ? [] : ['--draft'])
    .concat(process.env.GH_TARGET ? ['--target', process.env.GH_TARGET] : ['--verify-tag'])
    .concat(ASSETS.map(assetArg));
  console.log('\nwould run (new release):\n  ' +
    create.map(function (s) { return /[\s"#]/.test(s) ? JSON.stringify(s) : s; }).join(' '));
  console.log('\n(· = not built yet; a real run builds first. If a release for ' + TAG +
    ' already exists, publish updates it instead: gh release edit + gh release upload --clobber.)');
  process.exit(0);
}

// Real run.
fs.mkdirSync(OUT, { recursive: true });
buildAssets();

// Publish whatever built; omit (loudly) anything missing rather than aborting the
// whole release — e.g. Twellie.wgt when the Tizen SDK / Rosetta isn't available.
const present = ASSETS.filter(function (a) { return exists(a[0]); });
const missing = ASSETS.filter(function (a) { return !exists(a[0]); });
if (!present.length) { die('no artifacts were produced — nothing to publish.'); }
if (missing.length) {
  console.log('\nWARNING: omitting missing asset(s): ' + missing.map(function (m) { return m[0]; }).join(', '));
  if (missing.some(function (m) { return m[0] === 'Twellie.wgt'; })) {
    console.log('  Twellie.wgt needs the Tizen CLI — run `npm run tizen:setup` (Rosetta 2 on Apple Silicon).');
  }
}

try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); }
catch (e) { die('the GitHub CLI `gh` is not installed / not on PATH. Install it and run `gh auth login`.'); }

console.log('\npublishing ' + (LIVE ? '' : 'DRAFT ') + 'release ' + TAG + ' with ' + present.length + ' asset(s)…');
publishRelease(present);
console.log('\npublish: done.' +
  (LIVE ? '' : '  (DRAFT — review it on GitHub and click Publish, or re-run with --live.)'));
