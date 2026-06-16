'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { build, buildTizenbrew } = require('../tools/build');

function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twellie-scenes-'));
  try { fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('all platform builds include the channel page scene before app startup', () => {
  withTemp((dir) => {
    const outputs = {
      orsay: build('orsay', path.join(dir, 'orsay')),
      tizen: build('tizen', path.join(dir, 'tizen')),
      web: build('web', path.join(dir, 'web')),
      tizenbrew: path.join(buildTizenbrew(path.join(dir, 'tizenbrew')), 'app'),
    };

    Object.keys(outputs).forEach((name) => {
      const out = outputs[name];
      const scene = path.join(out, 'core', 'scenes', 'channel-page-scene.js');
      const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
      assert.ok(fs.existsSync(scene), name + ': missing channel page scene');
      assert.ok(html.includes('core/scenes/channel-page-scene.js'), name + ': scene script not loaded');
      assert.ok(
        html.indexOf('core/scenes/channel-page-scene.js') < html.indexOf('core/app.js'),
        name + ': scene must load before app.js'
      );
    });
  });
});
