'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { build } = require('../tools/build');

// The native Tizen build is the source `tizen package` turns into Twellie.wgt
// (installed via Apps2Samsung). It uses the privileged AVPlay player, so it must
// carry config.xml with the avplay privilege and the webapis/avplayer wiring.
function withBuild(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twellie-tz-'));
  try { fn(build('tizen', path.join(dir, 'out'))); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('tizen build lays out the web app + adapter', () => {
  withBuild((out) => {
    ['index.html', 'config.xml', 'core/app.js', 'ui/styles.css',
     'platform/player.js', 'platform/keys.js', 'platform/system.js', 'platform/boot.js']
      .forEach((f) => assert.ok(fs.existsSync(path.join(out, f)), 'missing ' + f));
  });
});

test('tizen config.xml declares the app id + AVPlay privilege', () => {
  withBuild((out) => {
    const cfg = fs.readFileSync(path.join(out, 'config.xml'), 'utf8');
    assert.ok(/tizen:application\s+id=/.test(cfg), 'no tizen:application id');
    assert.ok(cfg.includes('developer.samsung.com/privilege/avplay'), 'no avplay privilege');
    assert.ok(cfg.includes('tizen.org/privilege/internet'), 'no internet privilege');
  });
});

test('tizen index.html wires the native AVPlay player (not the web/hls path)', () => {
  withBuild((out) => {
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(html.includes('application/avplayer'), 'no avplayer object');
    assert.ok(html.includes('$WEBAPIS'), 'no webapis.js include');
    assert.ok(html.includes('platform/player.js'), 'adapter player not loaded');
  });
});
