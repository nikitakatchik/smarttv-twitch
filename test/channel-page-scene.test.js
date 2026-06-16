'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Stub TW.dom richly enough to run the VOD grid (focus frame + scroll) without a
// real DOM. See browser-scene.test.js for the same element-stub approach.
function setup(opts) {
  opts = opts || {};
  const els = {};
  function mk() {
    const e = {
      style: {}, className: '', textContent: '', innerHTML: '', children: [], _inner: null,
      appendChild(c) { this.children.push(c); return c; },
      getElementsByTagName() { return []; },
      offsetLeft: 0, offsetTop: 0, offsetWidth: 100, offsetHeight: 60, clientHeight: 600,
    };
    Object.defineProperty(e, 'firstChild', {
      get() { return this.children[0] || (this._inner || (this._inner = mk())); },
    });
    Object.defineProperty(e, 'childNodes', { get() { return this.children; } });
    return e;
  }
  const get = (id) => (els[id] || (els[id] = mk()));
  const calls = { goToChannel: [], goToBrowser: [] };

  const dom = {
    create: (t, c, h) => { const e = mk(); if (c) { e.className = c; } if (h != null) { e.innerHTML = h; } return e; },
    get,
    text(e, v) { if (e) { e.textContent = v; } },
    html(e, v) { if (e) { e.innerHTML = v; e.children = []; } },
    attr() {},
    addClass(e, c) { if (e) { e.className = (e.className ? e.className + ' ' : '') + c; } },
    removeClass() {},
    show(e, d) { if (e) { e.style.display = d || 'block'; } },
    hide(e) { if (e) { e.style.display = 'none'; } },
    escape: (s) => String(s == null ? '' : s),
    on() {},
  };

  const TW = {
    dom,
    KEY: { BACK: 'back', ENTER: 'enter', UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right' },
    i18n: { t: (k, a) => (a != null ? k + ':' + a : k) },
    config: { columns: 4 },
    noop: () => {},
    shortNumber: (n) => String(n),
    api: {
      channelInfo: (login, ok) => ok(opts.info || { login, display: login, description: '', avatar: '', followers: 0, online: false }),
      channelVideos: (login, cursor, ok) => ok({ items: (opts.vods || []).slice(), cursor: null }),
    },
    app: {
      goToChannel: (l, o) => calls.goToChannel.push([l, o]),
      goToBrowser: (m) => calls.goToBrowser.push(m),
    },
    BrowserScene: { MODE: { FOLLOWED: 4 } },
  };

  const g = { TW, window: null, document: { body: mk() }, Math, JSON };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'src/core/scenes/channel-page-scene.js'), 'utf8');
  vm.runInContext(code, g, { filename: 'channel-page-scene.js' });
  const scene = new TW.ChannelPageScene({});
  scene.initialize();
  scene.handleShow({ login: opts.login || 'someguy' });
  return { scene, calls, els, KEY: TW.KEY };
}

const vod = (id, title) => ({ kind: 'vod', id, title: title || id, duration: 65, viewers: 10, thumb: '' });

test('focus loads channel info and the VOD grid, focusing the first VOD', () => {
  const { scene } = setup({
    info: { login: 'someguy', display: 'Some Guy', description: 'bio', avatar: 'http://a.png', followers: 999, online: false },
    vods: [vod('v1'), vod('v2'), vod('v3')],
  });
  scene.handleFocus();
  assert.equal(scene.items.length, 3);
  assert.equal(scene.x, 0);
  assert.equal(scene.y, 0);
});

test('VOD selection frame surrounds the thumbnail, not the caption', () => {
  const { scene, els } = setup({ vods: [vod('v1')] });
  scene.handleFocus();
  const inner = scene.focusedCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 14;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84; // thumbnail + caption
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
  }];
  scene.rowEls[0].offsetTop = 4;
  scene.updateFrame();
  assert.equal(els['tw-cp-frame'].style.left, '5px');
  assert.equal(els['tw-cp-frame'].style.top, '10px');
  assert.equal(els['tw-cp-frame'].style.width, '100px');
  assert.equal(els['tw-cp-frame'].style.height, '60px');
});

test('a channel with no VODs shows the empty message', () => {
  const { scene, els } = setup({ vods: [] });
  scene.handleFocus();
  assert.equal(scene.items.length, 0);
  assert.notEqual(els['tw-cp-empty'].style.display, 'none'); // shown
});

test('selecting a VOD hands off to the player with vod + channelPage return', () => {
  const { scene, calls } = setup({ login: 'someguy', vods: [vod('v1', 'First'), vod('v2', 'Second')] });
  scene.handleFocus();
  scene.x = 1; scene.y = 0;        // second VOD
  scene.activate();
  assert.equal(calls.goToChannel.length, 1);
  assert.equal(calls.goToChannel[0][0], 'someguy');
  assert.equal(calls.goToChannel[0][1].vod.id, 'v2');
  assert.equal(calls.goToChannel[0][1].from, 'channelPage');
});

test('BACK returns to the Following tab', () => {
  const { scene, calls, KEY } = setup({ vods: [vod('v1')] });
  scene.handleFocus();
  scene.handleKeyDown(KEY.BACK);
  assert.deepEqual(calls.goToBrowser, [4]); // MODE.FOLLOWED
});
