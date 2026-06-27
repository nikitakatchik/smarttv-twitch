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

test('web preview keeps desktop remote beside the stage and adapts on phones', () => {
  withTemp((dir) => {
    const out = build('web', path.join(dir, 'web'));
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const dot = String.fromCharCode(0x00b7);
    const arrows = [0x2191, 0x2193, 0x2190, 0x2192]
      .map((code) => '<span class="legend-key legend-arrow">' + String.fromCharCode(code) + '</span>')
      .join('');

    assert.ok(html.includes('overflow: hidden; background: #3a3a42'), 'page should not scroll');
    assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'), 'web preview should opt into iPhone safe-area sizing');
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
    assert.ok(html.includes('<div class="page-title" id="tw-page-title">📺 Twellie Web Preview</div>'), 'page should have a visible title');
    assert.ok(html.includes('<a class="repo-button" id="tw-repo-button"'), 'page should have a GitHub repository button');
    assert.ok(html.includes('href="https://github.com/nkatchik/smarttv-twitch"'), 'repository button should point to the repo');
    assert.ok(html.includes('tabindex="-1"'), 'repository button should not enter the keyboard focus loop');
    assert.ok(html.includes('class="repo-logo"'), 'repository button should show the GitHub logo');
    assert.ok(html.includes('<span>GitHub</span>'), 'repository button should label GitHub');
    assert.ok(html.includes('<span class="repo-arrow">'), 'repository button should include an external-link arrow');
    assert.ok(html.includes('.repo-arrow { margin-left: 6px'), 'repository arrow should stay close to the GitHub label');
    assert.ok(!html.includes('.repo-arrow { margin-left: auto'), 'repository arrow should not be pushed to the far edge');
    assert.ok(html.includes('fill: currentColor'), 'repository logo should inherit the button color');
    assert.ok(!html.includes('ghbtns.com'), 'repository button should not depend on a third-party iframe');
    assert.ok(!html.includes('<iframe src="https://ghbtns.com'), 'repository button should not render an iframe');
    assert.ok(html.includes("global.document.getElementById('tw-page-title')"), 'fit should position the page title');
    assert.ok(html.includes("global.document.getElementById('tw-repo-button')"), 'fit should position the repo button');
    assert.ok(html.includes('var frameRect = frame.getBoundingClientRect();'), 'title should use rendered frame bounds');
    assert.ok(html.includes('position: absolute; left: 0; right: 0; top: 14px'), 'title should be centered on the whole page');
    assert.ok(!html.includes('title.style.left = frameRect.left'), 'title should not align horizontally to Twellie');
    assert.ok(!html.includes('title.style.width = frameRect.width'), 'title should not use Twellie width');
    assert.ok(html.includes('frameRect.top - title.offsetHeight'), 'title should center in the top gap');
    assert.ok(html.includes('var repoHeight = repo ? repo.offsetHeight : 0;'), 'fit should measure the repo button height');
    assert.ok(html.includes('Math.max(titleHeight, repoHeight)'), 'fit should reserve room for the tallest title-row item');
    assert.ok(html.includes('var titleTop = title ? parseFloat(title.style.top) : NaN;'), 'repo button should use the title position');
    assert.ok(html.includes('titleTop + ((title.offsetHeight - repo.offsetHeight) / 2)'), 'repo button should center vertically to the title');
    assert.ok(html.includes("repo.style.right = repoTop + 'px'"), 'repo button right margin should match its top margin');
    assert.ok(html.includes("repo.style.left = ''"), 'repo button should not align to the remote');
    assert.ok(!html.includes('var remoteRect = remote.getBoundingClientRect();'), 'repo button should not use rendered remote bounds');
    assert.ok(!html.includes('repo.style.left = Math.round(remoteRect.right - repo.offsetWidth)'), 'repo button should not align to the remote right edge');
    assert.ok(html.includes('width: 138px; margin: 0 0 0 16px'), 'remote should stay compact beside the stage');
    assert.ok(html.includes('width: 40px; height: 40px'), 'remote buttons should be square');
    assert.ok(html.includes('box-sizing: border-box; line-height: 38px'), 'remote buttons should not overflow their rows');
    assert.ok(html.includes('width: 100%; max-width: none; margin-left: 0; font-size: 13px'), 'phone remote should use the full frame width');
    assert.ok(html.includes('width: calc((100% - 16px) / 3);'), 'phone remote buttons should fill the three-column row width');
    assert.ok(html.includes('aspect-ratio: 1 / 1; height: auto; margin: 0; line-height: 1; font-size: 14px'), 'phone remote buttons should stay square');
    assert.ok(html.includes('.remote .r, .remote .g, .remote .y { font-weight: 700; }'), 'ABC buttons should be bold');
    assert.ok(html.includes('.remote-button-row { font-size: 0; line-height: 0; }'), 'button row whitespace should not wrap buttons');
    assert.ok(html.includes('.remote-spacer'), 'remote grid should keep directional buttons aligned');
    assert.ok(html.indexOf('data-tvkey="BACK"') < html.indexOf('data-tvkey="UP"'), 'Back should sit in the top-left D-pad corner');
    assert.ok(html.includes('class="remote-button-row remote-row-spaced remote-color-row"'), 'ABC row should be separately targetable');
    assert.ok(html.includes('.remote-color-row { display: none; }'), 'phone preview should hide ABC buttons');
    assert.ok(html.includes('class="legend-separator"'), 'legend should use a separator instead of a heading');
    assert.ok(html.includes('margin: 0 auto 15px'), 'separator should have balanced visual spacing');
    assert.ok(!html.includes('class="legend-title"'), 'legend heading should be omitted');
    assert.ok(!html.includes('>Keyboard<'), 'legend should not render Keyboard text');
    assert.ok(html.includes('function fitWebPreview()'), 'tight web preview should fit the stage dynamically');
    assert.ok(html.includes('id="tw-stage-wrap"'), 'fit should control the web preview wrapper spacing');
    assert.ok(html.includes('var compact = rawViewportWidth <= 700;'), 'fit should switch to compact phone layout by viewport width');
    assert.ok(html.includes('var minSpace = compact ? 6 : 16;'), 'fit should keep a shared desktop margin and tighter phone margin');
    assert.ok(html.includes('var surfaceInset = compact ? 10 : 0;'), 'phone preview should inset the TV surface inside the frame');
    assert.ok(html.includes('var safeAreaTop = compact ? readSafeAreaTop() : 0;'), 'phone preview should read the iPhone top safe area');
    assert.ok(html.includes('Math.max(28, safeAreaTop + 10)'), 'phone preview should sit below Dynamic Island safe area');
    assert.ok(html.includes('var minPageWidth = compact ? 320 : 960;'), 'fit should have desktop and compact minimum widths');
    assert.ok(html.includes('var minPageHeight = compact ? 420 : 500;'), 'fit should have desktop and compact minimum heights');
    assert.ok(html.includes('Math.max(rawViewportWidth, minPageWidth)'), 'fit should clamp the page width');
    assert.ok(html.includes('Math.max(rawViewportHeight, minPageHeight)'), 'fit should clamp the page height');
    assert.ok(html.includes('var heightScale ='), 'fit should reduce the stage when height is tight');
    assert.ok(html.includes('var titleBand ='), 'fit should reserve room for the centered title');
    assert.ok(html.includes("wrap.style.width = viewportWidth + 'px'"), 'fit should apply the minimum layout width');
    assert.ok(html.includes("wrap.style.height = compact ? 'auto' : viewportHeight + 'px'"), 'fit should keep fixed desktop height and allow phone flow');
    assert.ok(html.includes("wrap.style.padding = compact"), 'fit should use separate desktop and phone wrapper padding');
    assert.ok(html.includes(": minSpace + 'px ' + space + 'px'"), 'desktop horizontal margins should use the same spacing as the gap');
    assert.ok(html.includes('remote.style.marginLeft = space'), 'screen-to-remote gap should match outer margins');
    assert.ok(html.includes('if (compact) {') && html.includes("remote.style.marginLeft = '0';"), 'phone remote should stack below the stage');
    assert.ok(html.includes("remote.style.width = frameWidth + 'px'"), 'phone remote width should match the fitted stage width');
    assert.ok(html.includes("wrap.style.flexDirection = compact ? 'column' : 'row';"), 'phone layout should stack vertically while desktop stays row-based');
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
