'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The browse scene is DOM-heavy; stub TW.dom richly enough to exercise the
// Following view's two-section build, focus model, and routing without a real
// DOM. Elements track appended children and expose zeroed layout metrics so the
// selection-frame math runs without throwing.
function setup(opts) {
  opts = opts || {};
  const els = {};
  function mk() {
    const e = {
      style: {}, className: '', textContent: '', innerHTML: '', children: [], _inner: null,
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter((child) => child !== c); return c; },
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
  const calls = { goToChannel: [], goToChannelPage: [], goToLogin: 0 };

  const dom = {
    create: (t, c, h) => { const e = mk(); if (c) { e.className = c; } if (h != null) { e.innerHTML = h; } return e; },
    get,
    text(e, v) { if (e) { e.textContent = v; } },
    html(e, v) { if (e) { e.innerHTML = v; e.children = []; } },
    attr() {},
    addClass(e, c) { if (e) { e.className = (e.className ? e.className + ' ' : '') + c; } },
    removeClass(e, c) { if (e) { e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, ''); } },
    show(e, d) { if (e) { e.style.display = d || 'block'; } },
    hide(e) { if (e) { e.style.display = 'none'; } },
    escape: (s) => String(s == null ? '' : s),
    on() {},
  };

  const TW = {
    dom,
    KEY: { BACK: 'back', ENTER: 'enter', UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right', RED: 'red', GREEN: 'green', YELLOW: 'yellow' },
    i18n: { t: (k) => k },
    config: { columns: 4 },
    shortNumber: (n) => String(n),
    addCommas: (n) => String(n),
    auth: { isLoggedIn: () => true, user: () => ({ display: 'Me' }) },
    api: {
      followedStreams: (cursor, ok) => ok({ items: (opts.live || []).slice(), cursor: null }),
      followedChannels: (cursor, ok) => ok({ items: (opts.follows || []).slice(), cursor: null }),
      topStreams: (cursor, ok) => ok({ items: (opts.streams || []).slice(), cursor: null }),
      topGames: (cursor, ok) => ok({ items: (opts.games || []).slice(), cursor: null }),
      streamsByGame: (game, cursor, ok) => ok({ items: (opts.gameStreams || []).slice(), cursor: null }),
    },
    app: {
      goToChannel: (l) => calls.goToChannel.push(l),
      goToChannelPage: (l) => calls.goToChannelPage.push(l),
      goToLogin: () => { calls.goToLogin++; },
    },
    log: { warn() {}, info() {} },
    sceneManager: { focusedName: () => 'browser' },
  };

  const g = { TW, window: null, document: { body: mk() }, Math, JSON };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'src/core/scenes/browser-scene.js'), 'utf8');
  vm.runInContext(code, g, { filename: 'browser-scene.js' });
  const scene = new TW.BrowserScene({});
  scene.initialize();
  return { scene, calls, els, MODE: TW.BrowserScene.MODE, KEY: TW.KEY };
}

const stream = (login, display) => ({ kind: 'stream', login, display: display || login, title: 't', viewers: 1, thumb: '' });
const channel = (login, display) => ({ kind: 'channel', login, display: display || login, avatar: '' });
const game = (display) => ({ kind: 'game', display, viewers: 1, box: '' });

test('zero follows shows the empty state and builds no rows', () => {
  const { scene, els, MODE } = setup({ live: [], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 0);
  assert.notEqual(els['tw-follow-empty'].style.display, 'none'); // shown
  assert.equal(els['tw-follow'].style.display, 'none');          // grid hidden
});

test('live + offline render as two sections, with live channels excluded from offline', () => {
  const { scene, MODE } = setup({
    live: [stream('a', 'A')],
    // 'a' is live, so it must NOT appear again in the offline section.
    follows: [channel('a', 'A'), channel('b', 'B')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 2, 'one live row + one offline row');
  assert.equal(scene.fRows[0].items[0].kind, 'stream');
  assert.equal(scene.fRows[1].items[0].kind, 'channel');
  assert.equal(scene.fRows[1].items[0].login, 'b', 'live channel a filtered out of offline');
});

test('a lone tile is padded to full columns so it keeps standard size', () => {
  const { scene, MODE } = setup({ live: [stream('solo')], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 1);
  assert.equal(scene.fRows[0].cells.length, 1, 'one focusable cell');
  // The rendered row carries 4 <td>s (1 real + 3 pads) -> table-layout:fixed
  // keeps 25% columns instead of stretching the single tile.
  assert.equal(scene.fRows[0].el.children.length, 4);
});

test('a lone top-level channel tile is padded to full columns', () => {
  const { scene, els, MODE } = setup({ streams: [stream('solo')] });
  scene.switchMode(MODE.ALL, true);
  assert.equal(els['tw-grid'].style.display, 'table');
  assert.equal(scene.cells.length, 1, 'one focusable channel tile');
  assert.equal(scene.rowEls[0].childNodes.length, 4, '1 real tile + 3 pads');
});

test('flat grid selection frame surrounds the thumbnail, not the caption', () => {
  const { scene, els, MODE } = setup({ streams: [stream('solo')] });
  scene.switchMode(MODE.ALL, true);
  const inner = scene.focusedCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 9;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84; // thumbnail + caption
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
  }];
  scene.updateFrame();
  assert.equal(els['tw-grid-frame'].style.left, '5px');
  assert.equal(els['tw-grid-frame'].style.top, '9px');
  assert.equal(els['tw-grid-frame'].style.width, '100px');
  assert.equal(els['tw-grid-frame'].style.height, '60px');
});

test('top-level games use the tighter wrapper inset for cover padding', () => {
  const { scene, els, MODE } = setup({ games: [game('Chess')] });
  scene.switchMode(MODE.GAMES, true);
  assert.match(els['tw-grid-wrap'].className, /tw-grid-wrap-games/);
});

test('game stream lists return to the standard wrapper inset', () => {
  const { scene, els, MODE } = setup({ games: [game('Chess')], gameStreams: [stream('a')] });
  scene.switchMode(MODE.GAMES, true);
  scene.activate();
  assert.equal(scene.mode, MODE.GAMES_STREAMS);
  assert.doesNotMatch(els['tw-grid-wrap'].className, /tw-grid-wrap-games/);
});

test('the offline section lays out at 6 columns', () => {
  const { scene, MODE } = setup({
    live: [],
    follows: [channel('a'), channel('b'), channel('c'), channel('d'), channel('e'), channel('f'), channel('g')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 2, '7 channels -> two rows of 6');
  assert.equal(scene.fRows[0].cells.length, 6);
  assert.equal(scene.fRows[0].el.childNodes.length, 6);
  assert.equal(scene.fRows[1].cells.length, 1);
  assert.equal(scene.fRows[1].el.childNodes.length, 6); // 1 real + 5 pads
});

test('selecting a live tile opens the player; an offline tile opens the channel page', () => {
  const { scene, calls, MODE } = setup({ live: [stream('liveguy')], follows: [channel('offguy')] });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fr = 0; scene.fc = 0; scene.activateFollow();
  assert.deepEqual(calls.goToChannel, ['liveguy']);
  scene.fr = 1; scene.fc = 0; scene.activateFollow();
  assert.deepEqual(calls.goToChannelPage, ['offguy']);
});

test('UP from the top grid row hands focus to the tab row', () => {
  const { scene, MODE, KEY } = setup({ live: [stream('a')], follows: [channel('b')] });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.handleFollowKey(KEY.DOWN);            // -> offline row
  assert.equal(scene.fr, 1);
  scene.handleFollowKey(KEY.UP);              // -> back to live row
  assert.equal(scene.fr, 0);
  assert.equal(scene.onTopNav, false);
  scene.handleFollowKey(KEY.UP);              // -> tab row
  assert.equal(scene.onTopNav, true);
});
