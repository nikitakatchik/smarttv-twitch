'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
  const els = {};
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
  const player = {
    load() {},
    stop() {},
    destroy() {},
    setDisplayArea(x, y, w, h) { displayRects.push([x, y, w, h]); },
    getQualities(cb) { cb(['Auto']); },
    selectQuality() {},
  };
  const chat = { connections: [], closed: 0 };

  const dom = {
    create: (t, c, h) => { const e = mk(); if (c) { e.className = c; } if (h != null) { e.innerHTML = h; } return e; },
    get,
    text(e, v) { if (e) { e.textContent = v; } },
    html(e, v) { if (e) { e.innerHTML = v; e.children = []; } },
    attr() {},
    addClass(e, c) { if (e && e.className.indexOf(c) < 0) { e.className = (e.className ? e.className + ' ' : '') + c; } },
    removeClass(e, c) { if (e) { e.className = e.className.replace(c, '').replace(/\s+/g, ' ').trim(); } },
    show(e, d) { if (e) { e.style.display = d || 'block'; } },
    hide(e) { if (e) { e.style.display = 'none'; } },
    escape: (s) => String(s == null ? '' : s),
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
      streamInfo: (login, ok) => ok({ display: login, title: 'title', online: true, viewers: 10, logo: '' }),
    },
    twitch: {
      chat: {
        connect: (login, callbacks) => {
          chat.connections.push({ login, callbacks });
          return { close() { chat.closed++; } };
        },
      },
    },
    app: { goToBrowser() {}, goToChannelPage() {} },
  };
  const g = {
    TW,
    document: { body: mk() },
    Math,
    JSON,
    setInterval: () => 1,
    clearInterval() {},
  };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'src/core/scenes/channel-scene.js'), 'utf8');
  vm.runInContext(code, g, { filename: 'channel-scene.js' });
  const scene = new TW.ChannelScene({ createPlayer: () => player, system: {} });
  scene.initialize();
  scene.handleShow({ login: 'someguy' });
  scene.handleFocus();
  return { scene, els, displayRects, chat };
}

test('chat rail opens on the right and shrinks the player to a 16:9 surface', () => {
  const { scene, els, displayRects } = setup();

  assert.deepEqual(displayRects[displayRects.length - 1], [0, 0, 1280, 720]);

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
