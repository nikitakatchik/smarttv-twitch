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

test('web preview keeps the remote beside the fixed Twellie stage', () => {
  withTemp((dir) => {
    const out = build('web', path.join(dir, 'web'));
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const dot = String.fromCharCode(0x00b7);
    const arrows = [0x2191, 0x2193, 0x2190, 0x2192]
      .map((code) => '<span class="legend-key legend-arrow">' + String.fromCharCode(code) + '</span>')
      .join('');

    assert.ok(html.includes('overflow: hidden; background: #3a3a42'), 'page should not scroll');
    assert.ok(html.includes('<title>Twellie \u2014 Web Preview</title>'), 'browser title should name the web preview');
    assert.ok(html.includes('<link rel="icon" href="assets/icon/favicon.ico" sizes="any">'), 'web preview should expose an ico favicon');
    assert.ok(html.includes('<link rel="icon" href="assets/icon/favicon-32.png" type="image/png" sizes="32x32">'), 'web preview should expose a chrome png favicon');
    assert.ok(html.includes('<link rel="icon" href="assets/icon/favicon-16.png" type="image/png" sizes="16x16">'), 'web preview should expose a small png favicon');
    assert.ok(html.includes('<link rel="apple-touch-icon" href="assets/icon/apple-touch-icon.png">'), 'web preview should expose a safari/apple touch icon');
    assert.ok(!html.includes('rel="mask-icon"'), 'web preview should not use svg mask icons');
    assert.ok(!html.includes('rel="icon" href="assets/logo.svg"'), 'web preview should not use svg favicons');
    assert.ok(fs.existsSync(path.join(out, 'favicon.ico')), 'missing root favicon fallback');
    assert.ok(fs.existsSync(path.join(out, 'assets', 'icon', 'favicon.ico')), 'missing generated ico favicon');
    assert.ok(fs.existsSync(path.join(out, 'assets', 'icon', 'favicon-32.png')), 'missing generated favicon-32');
    assert.ok(fs.existsSync(path.join(out, 'assets', 'icon', 'favicon-16.png')), 'missing generated favicon-16');
    assert.ok(fs.existsSync(path.join(out, 'assets', 'icon', 'apple-touch-icon.png')), 'missing generated apple touch icon');
    assert.ok(html.includes('<div class="page-title" id="tw-page-title">Twellie Web Preview</div>'), 'page should have a visible title');
    assert.ok(html.includes("global.document.getElementById('tw-page-title')"), 'fit should position the page title');
    assert.ok(html.includes('var frameRect = frame.getBoundingClientRect();'), 'title should use rendered frame bounds');
    assert.ok(html.includes('position: absolute; left: 0; right: 0; top: 14px'), 'title should be centered on the whole page');
    assert.ok(!html.includes('title.style.left = frameRect.left'), 'title should not align horizontally to Twellie');
    assert.ok(!html.includes('title.style.width = frameRect.width'), 'title should not use Twellie width');
    assert.ok(html.includes('frameRect.top - title.offsetHeight'), 'title should center in the top gap');
    assert.ok(html.includes('width: 138px; margin: 0 0 0 16px'), 'remote should stay compact beside the stage');
    assert.ok(html.includes('width: 40px; height: 40px'), 'remote buttons should be square');
    assert.ok(html.includes('box-sizing: border-box; line-height: 38px'), 'remote buttons should not overflow their rows');
    assert.ok(html.includes('.remote .r, .remote .g, .remote .y { font-weight: 700; }'), 'ABC buttons should be bold');
    assert.ok(html.includes('.remote-button-row { font-size: 0; line-height: 0; }'), 'button row whitespace should not wrap buttons');
    assert.ok(html.includes('class="remote-button-row remote-row-spaced"'), 'spaced button rows should still suppress whitespace');
    assert.ok(html.includes('class="legend-separator"'), 'legend should use a separator instead of a heading');
    assert.ok(html.includes('margin: 0 auto 15px'), 'separator should have balanced visual spacing');
    assert.ok(!html.includes('class="legend-title"'), 'legend heading should be omitted');
    assert.ok(!html.includes('>Keyboard<'), 'legend should not render Keyboard text');
    assert.ok(html.includes('function fitWebPreview()'), 'tight web preview should fit the stage dynamically');
    assert.ok(html.includes('id="tw-stage-wrap"'), 'fit should control the web preview wrapper spacing');
    assert.ok(html.includes('var minSpace = 16;'), 'fit should keep a shared minimum margin');
    assert.ok(html.includes('var minPageWidth = 960;'), 'fit should have a minimum page width');
    assert.ok(html.includes('var minPageHeight = 500;'), 'fit should have a minimum page height');
    assert.ok(html.includes('Math.max(global.innerWidth || 1280, minPageWidth)'), 'fit should clamp the page width');
    assert.ok(html.includes('Math.max(global.innerHeight || 720, minPageHeight)'), 'fit should clamp the page height');
    assert.ok(html.includes('var heightScale ='), 'fit should reduce the stage when height is tight');
    assert.ok(html.includes('var titleBand ='), 'fit should reserve room for the centered title');
    assert.ok(html.includes("wrap.style.width = viewportWidth + 'px'"), 'fit should apply the minimum layout width');
    assert.ok(html.includes("wrap.style.height = viewportHeight + 'px'"), 'fit should apply the minimum layout height');
    assert.ok(html.includes("wrap.style.padding = minSpace + 'px ' + space + 'px'"), 'horizontal margins should use the same spacing as the gap');
    assert.ok(html.includes('remote.style.marginLeft = space'), 'screen-to-remote gap should match outer margins');
    assert.ok(html.indexOf('class="tv-frame"') < html.indexOf('class="remote"'), 'remote should follow the screen');
    assert.ok(!html.includes('Virtual remote'), 'remote heading should be omitted');
    assert.ok(!html.includes('A ' + dot + ' Channels'), 'ABC buttons should not include hints');
    assert.ok(!html.includes('data-tvkey="CH_UP"'), 'virtual remote should omit CH up');
    assert.ok(!html.includes('data-tvkey="CH_DOWN"'), 'virtual remote should omit CH down');
    assert.ok(!html.includes('No colour buttons'), 'legend should stay compact');
    assert.ok(html.includes(arrows));
    assert.ok(!html.includes('<kbd class="legend-key">'), 'legend keys should not render as badges');
    assert.ok(!html.includes('background: #1f1f23; border: 1px solid #3a3a44'), 'legend keys should not use badge backgrounds');
    assert.ok(html.includes('font-weight: 700'), 'legend keys should use font styling');
    assert.ok(html.includes('.legend-arrow { text-shadow:'), 'arrow glyphs need extra visual weight');
    assert.ok(html.includes('<span class="legend-key">Enter</span>'));
    assert.ok(html.includes('<span class="legend-key">Backspace</span>'));
    assert.ok(html.includes('right: 50%'), 'legend keys should align to the center gutter');
    assert.ok(html.includes('left: 50%'), 'legend actions should align to the center gutter');
  });
});
