'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(opts) {
  opts = opts || {};
  const els = {};
  const timeouts = [];
  let now = 1000;
  function mk() {
    const e = {
      style: {}, className: '', textContent: '', innerHTML: '', children: [],
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); } return c; },
      getElementsByTagName() { return []; },
    };
    Object.defineProperty(e, 'firstChild', { get() { return this.children[0] || null; } });
    return e;
  }
  const get = (id) => (els[id] || (els[id] = mk()));
  const displayRects = [];
  const seekCalls = [];
  const pauseCalls = [];
  const resumeCalls = [];
  const commitCalls = [];
  const loadCalls = [];
  const player = {
    position: opts.position || 0,
    duration: opts.duration || 300,
    load(url, meta) { loadCalls.push({ url, meta }); },
    stop() {},
    destroy() {},
    setDisplayArea(x, y, w, h) { displayRects.push([x, y, w, h]); },
    getQualities(cb) { cb(['Auto']); },
    selectQuality() {},
    canSeek() { return !!opts.canSeek; },
    getPosition() { return this.position; },
    getDuration() { return this.duration; },
    seekTo(seconds) { this.position = seconds; seekCalls.push(seconds); },
    commitSeek() { commitCalls.push(true); },
    pause() { pauseCalls.push(true); },
    resume() { resumeCalls.push(true); },
  };
  const chat = { connections: [], closed: 0 };
  const calls = { goToBrowser: 0, goToChannelPage: 0 };

  const dom = {
    create: (t, c, h) => { const e = mk(); if (c) { e.className = c; } if (h != null) { e.innerHTML = h; } return e; },
    get,
    text(e, v) { if (e) { e.textContent = v; } },
    html(e, v) { if (e) { e.innerHTML = v; e.children = []; } },
    addClass(e, c) { if (e && e.className.indexOf(c) < 0) { e.className = (e.className ? e.className + ' ' : '') + c; } },
    removeClass(e, c) { if (e) { e.className = e.className.replace(c, '').replace(/\s+/g, ' ').trim(); } },
    show(e, d) { if (e) { e.style.display = d || 'block'; } },
    hide(e) { if (e) { e.style.display = 'none'; } },
    escape: (s) => String(s == null ? '' : s),
    attr(e, name, value) {
      if (!e) { return value === undefined ? null : undefined; }
      e.attrs = e.attrs || {};
      if (value === undefined) { return e.attrs[name] || null; }
      e.attrs[name] = value;
    },
    on() {},
  };

  const TW = {
    dom,
    KEY: { BACK: 'back', ENTER: 'enter', LEFT: 'left', RIGHT: 'right', UP: 'up', DOWN: 'down', CH_UP: 'chup', CH_DOWN: 'chdown', N1: '1', N4: '4' },
    config: { screen: { width: 1280, height: 720 } },
    i18n: { t: (k) => k },
    addCommas: (n) => String(n),
    noop: () => {},
    api: {
      playbackUrl: (login, ok) => ok('http://example/live.m3u8'),
      vodPlaybackUrl: (id, ok) => ok(`http://example/${id}.m3u8`),
      clipPlayback: (slug, ok) => ok({ url: `http://example/${slug}.mp4` }),
      streamInfo: (login, ok) => ok(opts.streamInfo || { display: login, title: 'title', online: true, viewers: 10, logo: 'avatar.png', game: 'Game' }),
    },
    twitch: {
      chat: {
        connect: (login, callbacks) => {
          chat.connections.push({ login, callbacks });
          return { close() { chat.closed++; } };
        },
      },
    },
    app: {
      goToBrowser() { calls.goToBrowser++; },
      goToChannelPage() { calls.goToChannelPage++; },
    },
  };
  const g = {
    TW,
    document: { body: mk() },
    Math,
    JSON,
    Date: { now: () => now },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(fn, ms) {
      const id = timeouts.length + 1;
      timeouts.push({ fn, ms, active: true });
      return id;
    },
    clearTimeout(id) {
      if (timeouts[id - 1]) { timeouts[id - 1].active = false; }
    },
  };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'src/core/scenes/channel-scene.js'), 'utf8');
  vm.runInContext(code, g, { filename: 'channel-scene.js' });
  const scene = new TW.ChannelScene({ createPlayer: () => player, system: {} });
  scene.initialize();
  scene.handleShow(opts.showData || (opts.vod
    ? { login: 'someguy', vod: { kind: 'vod', id: 'v1', title: 'vod title', duration: player.duration, viewers: 7 } }
    : { login: 'someguy', stream: opts.stream || null }));
  scene.handleFocus();
  get('tw-controls');
  function runTimeout(ms) {
    const t = timeouts.find((item) => item.active && item.ms === ms);
    assert.ok(t, `expected active timeout for ${ms}ms`);
    t.active = false;
    t.fn();
  }
  function tick(ms) { now += ms; }
  return { scene, els, displayRects, chat, calls, runTimeout, tick, seekCalls, pauseCalls, resumeCalls, commitCalls, loadCalls, TW };
}

test('chat rail opens on the right and shrinks the player to a 16:9 surface', () => {
  const { scene, els, displayRects } = setup();

  assert.deepEqual(displayRects[displayRects.length - 1], [0, 0, 1280, 720]);
  assert.equal(els['tw-chat-name'].textContent, 'someguy');
  assert.equal(els['tw-chat-avatar'].attrs.src, 'avatar.png');
  assert.equal(els['tw-chat-live-badge'].textContent, 'LIVE');
  assert.equal(els['tw-chat-viewer-number'].textContent, '10');
  assert.equal(els['tw-chat-viewer-label'].textContent, ' VIEWERS');

  scene.openChat();
  assert.deepEqual(displayRects[displayRects.length - 1], [0, 101, 920, 518]);
  assert.equal(els['tw-player-surface'].style.left, '0px');
  assert.equal(els['tw-player-surface'].style.top, '101px');
  assert.equal(els['tw-player-surface'].style.width, '920px');
  assert.equal(els['tw-player-surface'].style.height, '518px');
  assert.equal(els['tw-chat'].style.left, '920px');
  assert.equal(els['tw-chat'].style.width, '360px');

  scene.closeChat();
  assert.deepEqual(displayRects[displayRects.length - 1], [0, 0, 1280, 720]);
});

test('chat header mirrors refreshed live viewer count', () => {
  const { scene, els } = setup({
    stream: { display: 'Seed Name', title: 'seed title', viewers: 42, game: 'Seed Game' },
    streamInfo: { display: 'Some Guy', title: 'live title', online: true, viewers: 1234, logo: 'some-guy.png', game: 'Live Game' },
  });

  assert.equal(els['tw-c-viewers'].textContent, '1234 VIEWERS');
  assert.equal(els['tw-chat-name'].textContent, 'Some Guy');
  assert.equal(els['tw-chat-avatar'].attrs.src, 'some-guy.png');
  assert.equal(els['tw-chat-viewer-number'].textContent, '1234');
  assert.equal(els['tw-chat-viewer-label'].textContent, ' VIEWERS');
  assert.equal(scene.chatViewerText, '1234 VIEWERS');
});

test('player adapter receives source metadata for web playback fallbacks', () => {
  const live = setup();
  assert.equal(live.loadCalls[0].url, 'http://example/live.m3u8');
  assert.equal(live.loadCalls[0].meta.kind, 'live');
  assert.equal(live.loadCalls[0].meta.login, 'someguy');

  const vod = setup({ vod: true });
  assert.equal(vod.loadCalls[0].url, 'http://example/v1.m3u8');
  assert.equal(vod.loadCalls[0].meta.kind, 'vod');
  assert.equal(vod.loadCalls[0].meta.id, 'v1');
});

test('hidden chat keeps only a small recent buffer and renders it on open', () => {
  const { scene, els, chat } = setup();
  assert.equal(chat.connections.length, 1);

  for (let i = 0; i < 45; i++) {
    chat.connections[0].callbacks.onMessage({ nick: 'u' + i, color: '', text: 'm' + i });
  }

  assert.equal(scene.chatMessages.length, 40);
  assert.equal(scene.chatMessages[0].text, 'm5');
  assert.equal(scene.chatMessages[39].text, 'm44');
  assert.equal(els['tw-chat-list'].children.length, 0);

  scene.openChat();
  assert.equal(els['tw-chat-list'].children.length, 40);
  assert.match(els['tw-chat-list'].children[0].innerHTML, /m5/);
  assert.match(els['tw-chat-list'].children[39].innerHTML, /m44/);

  scene.closeChat();
  assert.equal(els['tw-chat-list'].children.length, 0);

  chat.connections[0].callbacks.onMessage({ nick: 'last', color: '', text: 'm45' });
  assert.equal(scene.chatMessages.length, 40);
  assert.equal(scene.chatMessages[39].text, 'm45');
  assert.equal(els['tw-chat-list'].children.length, 0);
});

test('quality panel is anchored to the quality control', () => {
  const { scene, els, TW } = setup();
  const surface = els['tw-player-surface'];
  const controls = els['tw-controls'];
  const quality = els['tw-ctl-quality'];
  const panel = els['tw-panel'];

  surface.offsetWidth = 1280;
  surface.offsetHeight = 720;
  controls.offsetParent = surface;
  controls.offsetLeft = 42;
  controls.offsetTop = 638;
  quality.offsetParent = controls;
  quality.offsetLeft = 248;
  quality.offsetTop = 0;
  quality.offsetWidth = 74;
  panel.offsetWidth = 318;
  panel.offsetHeight = 184;

  scene.showPanel();

  assert.equal(panel.style.left, '168px');
  assert.equal(panel.style.bottom, '98px');
  assert.equal(panel.style.display, 'block');

  scene.handleKeyDown(TW.KEY.BACK);
  assert.equal(panel.style.display, 'none');
  assert.equal(scene.panelShown, false);
  assert.equal(scene.overlayShown, true);
  assert.equal(els['tw-controls'].style.display, 'block');
  assert.equal(els['tw-player-scrim'].style.display, 'block');
});

test('live metadata renders game beside the channel name', () => {
  const { scene, els } = setup({
    stream: { display: 'Seed Name', title: 'seed title', viewers: 42, game: 'Seed Game' },
    streamInfo: { display: 'Some Guy', title: 'live title', online: true, viewers: 10, logo: '', game: 'Live Game' },
  });

  assert.equal(els['tw-c-name'].textContent, 'Some Guy');
  assert.equal(els['tw-c-game'].textContent, 'Live Game');
  assert.match(scene.root.className, /tw-has-game/);
});

test('seekable VOD hides transport buttons but keeps player actions', () => {
  const { els } = setup({ vod: true, canSeek: true });

  assert.equal(els['tw-ctl-back'].style.display, 'none');
  assert.equal(els['tw-ctl-forward'].style.display, 'none');
  assert.equal(els['tw-ctl-channel'].style.display, 'inline-block');
  assert.equal(els['tw-ctl-quality'].style.display, 'inline-block');
  assert.equal(els['tw-progress'].style.display, 'block');
  assert.match(els['tw-progress'].className, /tw-focused/);
});

test('VOD Left and Right seek directly and accelerate repeated keydown', () => {
  const { scene, seekCalls, tick, TW } = setup({ vod: true, canSeek: true, position: 100, duration: 600 });

  scene.handleKeyDown(TW.KEY.RIGHT);
  tick(100);
  scene.handleKeyDown(TW.KEY.RIGHT);
  tick(100);
  scene.handleKeyDown(TW.KEY.RIGHT);
  tick(100);
  scene.handleKeyDown(TW.KEY.LEFT);
  tick(700);
  scene.handleKeyDown(TW.KEY.LEFT);

  assert.deepEqual(seekCalls, [110, 130, 160, 150, 140]);
});

test('seekable VOD switches focus between seekbar and action buttons', () => {
  const { scene, els, seekCalls, calls, TW } = setup({ vod: true, canSeek: true, position: 100, duration: 600 });

  assert.equal(scene.overlayFocus, 'seek');
  assert.equal(scene.controlIndex, 0);
  scene.handleKeyDown(TW.KEY.DOWN);
  assert.equal(scene.overlayFocus, 'buttons');
  assert.equal(scene.controlIndex, 0);
  scene.handleKeyDown(TW.KEY.RIGHT);
  assert.equal(scene.controlIndex, 1);
  scene.handleKeyDown(TW.KEY.LEFT);
  assert.equal(scene.controlIndex, 0);
  assert.deepEqual(seekCalls, []);
  scene.handleKeyDown(TW.KEY.ENTER);
  assert.equal(calls.goToChannelPage, 1);

  scene.handleKeyDown(TW.KEY.DOWN);
  assert.equal(scene.overlayShown, false);
  assert.equal(scene.overlayBackGrace, false);
  assert.equal(els['tw-controls'].style.display, 'none');
  assert.equal(els['tw-player-scrim'].style.display, 'none');
});

test('seekable VOD seekbar regains focus with Up and then Left and Right seek', () => {
  const { scene, seekCalls, pauseCalls, commitCalls, TW } = setup({ vod: true, canSeek: true, position: 100, duration: 600 });

  scene.handleKeyDown(TW.KEY.DOWN);
  assert.equal(scene.overlayFocus, 'buttons');
  scene.handleKeyDown(TW.KEY.UP);
  assert.equal(scene.overlayFocus, 'seek');
  scene.handleKeyDown(TW.KEY.RIGHT);
  assert.deepEqual(seekCalls, [110]);
  scene.handleKeyDown(TW.KEY.ENTER);
  assert.equal(commitCalls.length, 1);
  assert.equal(pauseCalls.length, 0);
});

test('hidden VOD Left and Right seek fixed 10s and only show a flash', () => {
  const { scene, els, seekCalls, tick, runTimeout, TW } = setup({ vod: true, canSeek: true, position: 100, duration: 600 });

  runTimeout(3000);
  assert.equal(scene.overlayShown, false);

  scene.handleKeyDown(TW.KEY.RIGHT);
  tick(100);
  scene.handleKeyDown(TW.KEY.RIGHT);

  assert.equal(scene.overlayShown, false);
  assert.deepEqual(seekCalls, [110, 120]);
  assert.equal(els['tw-seek-flash'].style.display, 'block');
  assert.equal(els['tw-seek-flash'].textContent, '+10s');
  assert.match(els['tw-seek-flash'].className, /tw-seek-flash-right/);

  runTimeout(650);
  assert.equal(els['tw-seek-flash'].style.display, 'none');
});

test('hidden VOD OK pauses while active seekbar OK confirms seek', () => {
  const { scene, els, seekCalls, pauseCalls, resumeCalls, commitCalls, runTimeout, TW } = setup({ vod: true, canSeek: true, position: 100, duration: 600 });

  runTimeout(3000);
  scene.handleKeyDown(TW.KEY.DOWN);

  assert.equal(scene.overlayShown, true);
  assert.equal(scene.overlayFocus, 'seek');
  assert.deepEqual(seekCalls, []);
  assert.equal(pauseCalls.length, 0);

  runTimeout(3000);
  scene.handleKeyDown(TW.KEY.ENTER);
  assert.equal(scene.overlayShown, true);
  assert.equal(pauseCalls.length, 1);
  assert.equal(els['tw-pause-indicator'].style.display, 'block');

  scene.handleKeyDown(TW.KEY.ENTER);
  assert.equal(commitCalls.length, 1);
  assert.equal(resumeCalls.length, 0);
  assert.equal(els['tw-pause-indicator'].style.display, 'block');
});

test('player status indicators distinguish loading, buffering, and errors', () => {
  const { scene, els } = setup({ vod: true, canSeek: true, position: 100, duration: 600 });
  const loading = els['tw-c-loading'];
  const text = els['tw-c-loading-text'];

  scene.showLoading();
  assert.equal(loading.style.display, 'block');
  assert.equal(text.textContent, '');
  assert.doesNotMatch(loading.className, /tw-msg/);
  assert.doesNotMatch(loading.className, /tw-error/);

  scene.showBuffering('BUFFERING: 25%');
  assert.equal(loading.style.display, 'block');
  assert.equal(text.textContent, 'BUFFERING: 25%');
  assert.match(loading.className, /tw-msg/);
  assert.doesNotMatch(loading.className, /tw-error/);

  scene.showError('ERROR_RENDER');
  assert.equal(loading.style.display, 'block');
  assert.equal(text.textContent, 'ERROR_RENDER');
  assert.match(loading.className, /tw-msg/);
  assert.match(loading.className, /tw-error/);
});

test('hidden live OK only shows overlay', () => {
  const { scene, calls, runTimeout, TW } = setup();

  runTimeout(3000);
  scene.handleKeyDown(TW.KEY.ENTER);

  assert.equal(scene.overlayShown, true);
  assert.equal(calls.goToChannelPage, 0);
});

test('live Down on the button row hides the overlay', () => {
  const { scene, els, TW } = setup();

  assert.equal(scene.overlayShown, true);
  assert.equal(scene.overlayFocus, 'buttons');

  scene.handleKeyDown(TW.KEY.DOWN);

  assert.equal(scene.overlayShown, false);
  assert.equal(scene.overlayBackGrace, false);
  assert.equal(els['tw-player-scrim'].style.display, 'none');
  assert.equal(els['tw-nowbar'].style.display, 'none');
  assert.equal(els['tw-controls'].style.display, 'none');
});

test('overlay auto-hides after inactivity and Back grace consumes one Back', () => {
  const { scene, els, calls, runTimeout, TW } = setup();

  assert.equal(scene.overlayShown, true);

  runTimeout(3000);

  assert.equal(scene.overlayShown, false);
  assert.equal(scene.overlayBackGrace, true);
  assert.equal(els['tw-player-scrim'].style.display, 'none');
  assert.equal(els['tw-nowbar'].style.display, 'none');
  assert.equal(els['tw-controls'].style.display, 'none');

  scene.handleKeyDown(TW.KEY.BACK);
  assert.equal(calls.goToBrowser, 0);
  assert.equal(scene.overlayBackGrace, false);

  scene.handleKeyDown(TW.KEY.BACK);
  assert.equal(calls.goToBrowser, 1);
});

test('Back manually hides overlay without starting grace', () => {
  const { scene, calls, TW } = setup();

  scene.handleKeyDown(TW.KEY.BACK);

  assert.equal(scene.overlayShown, false);
  assert.equal(scene.overlayBackGrace, false);
  assert.equal(calls.goToBrowser, 0);

  scene.handleKeyDown(TW.KEY.BACK);
  assert.equal(calls.goToBrowser, 1);
});

test('non-Back key shows an auto-hidden overlay and clears Back grace', () => {
  const { scene, runTimeout, TW } = setup();

  runTimeout(3000);
  assert.equal(scene.overlayShown, false);
  assert.equal(scene.overlayBackGrace, true);

  scene.handleKeyDown(TW.KEY.RIGHT);

  assert.equal(scene.overlayShown, true);
  assert.equal(scene.overlayBackGrace, false);
});
