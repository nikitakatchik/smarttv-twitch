'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildTizenbrew, MODULE_PKG } = require('../tools/build');
const rootPkg = require('../package.json');

function withBuild(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twellie-tb-'));
  try { fn(buildTizenbrew(path.join(dir, 'out'))); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('tizenbrew build emits a valid TizenBrew app-module manifest', () => {
  withBuild((out) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
    assert.equal(pkg.packageType, 'app');
    assert.equal(pkg.appName, 'Twellie');
    assert.equal(pkg.appPath, 'app/index.html');           // root-relative, nests under app/
    assert.ok(Array.isArray(pkg.keys) && pkg.keys.indexOf('ColorF0Red') !== -1);
    assert.ok(fs.existsSync(path.join(out, pkg.appPath)));  // appPath actually resolves
  });
});

test('tizenbrew build lays the runnable app under app/', () => {
  withBuild((out) => {
    const app = path.join(out, 'app');
    ['index.html', 'core/app.js', 'core/twitch/api.js', 'ui/styles.css',
     'platform/player.js', 'platform/keys.js', 'platform/system.js', 'platform/boot.js']
      .forEach((f) => assert.ok(fs.existsSync(path.join(app, f)), 'missing ' + f));
  });
});

test('tizenbrew index.html uses the non-privileged web path (no avplay/$WEBAPIS/config.xml)', () => {
  withBuild((out) => {
    const html = fs.readFileSync(path.join(out, 'app', 'index.html'), 'utf8');
    assert.ok(html.includes('id="tw-video"'));             // HTML5 video element
    assert.ok(/hls\.js/.test(html));                       // hls.js loaded
    assert.ok(!html.includes('$WEBAPIS'));                 // no privileged webapis shim
    assert.ok(!/avplayer|avplay/.test(html));              // no AVPlay object
    assert.ok(!html.includes('config.xml'));               // not a .wgt
    assert.ok(!html.includes('class="remote"'));           // harness chrome stripped
    // every local script path is root-relative (only the hls.js CDN is absolute https)
    const srcs = (html.match(/src="([^"]+)"/g) || []).map((s) => s.slice(5, -1));
    srcs.forEach((s) => {
      if (/^https:\/\//.test(s)) { assert.ok(/hls\.js/.test(s), 'unexpected absolute src ' + s); }
      else { assert.ok(s[0] !== '/' && !/^https?:/.test(s), 'non-relative src ' + s); }
    });
  });
});

test('tizenbrew module pkg matches the exported MODULE_PKG', () => {
  withBuild((out) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
    assert.deepEqual(pkg, MODULE_PKG);
  });
});

test('root package is explicitly addable as a TizenBrew GitHub module', () => {
  assert.equal(rootPkg.packageType, 'app');
  assert.equal(rootPkg.appName, 'Twellie');
  assert.equal(rootPkg.appPath, 'tizenbrew/index.html');
  assert.ok(rootPkg.keywords.includes('twellie'));
  assert.ok(rootPkg.keywords.includes('tizenbrew'));
  assert.deepEqual(rootPkg.keys, MODULE_PKG.keys);
  assert.ok(fs.existsSync(path.join(__dirname, '..', rootPkg.appPath)));
});

test('explicit TizenBrew GitHub entrypoint resolves source-tree assets', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', rootPkg.appPath), 'utf8');
  assert.ok(html.includes('<base href="../src/">'));
  assert.ok(html.includes('src="core/app.js"'));
  assert.ok(html.includes('src="platforms/tizenbrew/boot.js"'));
  assert.ok(!html.includes('src="platform/boot.js"'));
});
