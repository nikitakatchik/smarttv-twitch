'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The browse scene is DOM-heavy; stub TW.dom richly enough to exercise the
// Following view's sectioned build, focus model, and routing without a real
// DOM. Elements track appended children and expose zeroed layout metrics so the
// selection-frame math runs without throwing.
function setup(opts) {
  opts = opts || {};
  const els = {};
  function mk() {
    const e = {
      style: {}, className: '', textContent: '', innerHTML: '', children: [], _inner: null,
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter((child) => child !== c); if (c.parentNode === this) { c.parentNode = null; } return c; },
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
    i18n: { t: (k, ...args) => args.length ? `${k}:${args.join(',')}` : k },
    config: { columns: 4 },
    shortNumber: (n) => String(n),
    addCommas: (n) => String(n),
    auth: { isLoggedIn: () => opts.loggedIn !== false, user: () => ({ display: 'Me' }) },
    api: {
      followedStreams: (cursor, ok) => ok({ items: (opts.live || []).slice(), cursor: null }),
      followedGames: (ok) => ok({ items: (opts.categories || []).slice(), cursor: false }),
      followedChannels: (cursor, ok) => ok({ items: (opts.follows || []).slice(), cursor: null }),
      topStreams: (cursor, ok) => ok({ items: (opts.streams || []).slice(), cursor: null }),
      topGames: (cursor, ok) => ok({ items: (opts.games || []).slice(), cursor: null }),
      streamsByGame: (game, cursor, ok) => ok({ items: (opts.gameStreams || []).slice(), cursor: null }),
      categoryInfo: (game, ok) => ok(opts.categoryInfo || game),
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

const stream = (login, display, extra) => Object.assign(
  { kind: 'stream', login, display: display || login, title: 't', viewers: 1, thumb: '' },
  extra || {},
);
const channel = (login, display) => ({ kind: 'channel', login, display: display || login, avatar: '' });
const game = (display) => ({ kind: 'game', name: display, display, viewers: 1, box: '' });

test('zero follows shows the empty state and builds no rows', () => {
  const { scene, els, MODE } = setup({ live: [], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 0);
  assert.notEqual(els['tw-follow-empty'].style.display, 'none'); // shown
  assert.equal(els['tw-follow'].style.display, 'none');          // grid hidden
});

test('logged-out Following stays in the tab and suggests logging in', () => {
  const { scene, calls, els, MODE } = setup({ loggedIn: false });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.mode, MODE.FOLLOWED);
  assert.equal(calls.goToLogin, 0);
  assert.equal(scene.fRows.length, 0);
  assert.equal(scene.loading, false);
  assert.equal(els['tw-follow-empty'].textContent, 'FOLLOW_LOGIN');
  assert.notEqual(els['tw-follow-empty'].style.display, 'none');
  assert.equal(els['tw-follow'].style.display, 'none');
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

test('Following renders Live Categories before live and offline rows', () => {
  const { scene, MODE } = setup({
    categories: [
      Object.assign(game('Chess'), { viewers: 5, followers: 20, box: 'http://img/chess.jpg' }),
      Object.assign(game('Chess'), { viewers: 5, followers: 20, box: 'http://img/chess.jpg' }),
      Object.assign(game('Offline Game'), { viewers: 0, followers: 20 }),
    ],
    live: [stream('a', 'A')],
    follows: [channel('a', 'A'), channel('c', 'C')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fCategories.length, 1, 'duplicate live categories are merged');
  assert.equal(scene.fCategories[0].name, 'Chess');
  assert.equal(scene.fCategories[0].viewers, 5);
  assert.equal(scene.fRows.length, 3, 'category row + live row + offline row');
  assert.equal(scene.fRows[0].items[0].kind, 'game');
  assert.equal(scene.fRows[1].items[0].kind, 'stream');
  assert.equal(scene.fRows[2].items[0].kind, 'channel');
});

test('Following sorts live categories and live channels by viewer count', () => {
  const { scene, MODE } = setup({
    categories: [
      Object.assign(game('Low Category'), { viewers: 5 }),
      Object.assign(game('High Category'), { viewers: 50 }),
    ],
    live: [
      stream('low-live', 'Low Live', { viewers: 7 }),
      stream('high-live', 'High Live', { viewers: 70 }),
    ],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fCategories[0].name, 'High Category');
  assert.equal(scene.fLive[0].login, 'high-live');
  assert.equal(scene.fRows[0].items[0].name, 'High Category');
  assert.equal(scene.fRows[1].items[0].login, 'high-live');
});

test('Following shows followed live categories even when matching followed channels are not live', () => {
  const { scene, MODE } = setup({
    categories: [
      Object.assign(game('Chess'), { viewers: 5, followers: 20, box: 'http://img/chess.jpg' }),
    ],
    live: [],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fCategories.length, 1);
  assert.equal(scene.fRows.length, 1);
  assert.equal(scene.fRows[0].items[0].name, 'Chess');
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

test('browse grid thumbnails carry dimensions and placeholder fallback', () => {
  const { scene } = setup();
  const streamCell = scene.createCell({ kind: 'stream', display: 'A', title: 'T', viewers: 1, thumb: 'http://img/a.jpg' });
  assert.match(streamCell.innerHTML, /class="tw-thumb" width="320" height="180" src="http:\/\/img\/a\.jpg"/);
  assert.match(streamCell.innerHTML, /onerror="this\.removeAttribute\('src'\)"/);
  const gameCell = scene.createCell({ kind: 'game', display: 'G', viewers: 2, box: 'http://img/g.jpg' });
  assert.match(gameCell.innerHTML, /class="tw-thumb" width="285" height="380" src="http:\/\/img\/g\.jpg"/);
});

test('offline channel avatars keep their placeholder on load failure', () => {
  const { scene } = setup();
  const cell = scene.createChannelCell({ display: 'A', avatar: 'http://img/avatar.jpg' });
  assert.match(cell.innerHTML, /class="tw-chan-avatar" width="96" height="96" src="http:\/\/img\/avatar\.jpg"/);
  assert.match(cell.innerHTML, /onerror="this\.removeAttribute\('src'\)"/);
});

test('flat grid selection frame surrounds the thumbnail, not the caption', () => {
  const { scene, els, MODE } = setup({ streams: [stream('solo')] });
  scene.switchMode(MODE.ALL, true);
  const inner = scene.focusedCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 9;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84; // thumbnail + caption
  inner.getBoundingClientRect = () => ({ left: 20, top: 30, right: 120, bottom: 114 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 20, top: 30, right: 120.5, bottom: 90.25 }),
  }];
  scene.updateFrame();
  assert.equal(els['tw-grid-frame'].style.left, '5px');
  assert.equal(els['tw-grid-frame'].style.top, '9px');
  assert.equal(els['tw-grid-frame'].style.width, '100.5px');
  assert.equal(els['tw-grid-frame'].style.height, '60.25px');
});

test('flat grid selection frame converts scaled rects back to stage coordinates', () => {
  const { scene, els, MODE } = setup({ streams: [stream('solo')] });
  scene.switchMode(MODE.ALL, true);
  const inner = scene.focusedCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 9;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84;
  inner.getBoundingClientRect = () => ({ left: 10, top: 20, right: 60, bottom: 62 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 10, top: 20, right: 60.25, bottom: 50.125 }),
  }];
  scene.updateFrame();
  assert.equal(els['tw-grid-frame'].style.left, '5px');
  assert.equal(els['tw-grid-frame'].style.top, '9px');
  assert.equal(els['tw-grid-frame'].style.width, '100.5px');
  assert.equal(els['tw-grid-frame'].style.height, '60.25px');
});

test('Following live selection frame preserves fractional thumbnail bounds', () => {
  const { scene, els, MODE } = setup({ live: [stream('solo')], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  const inner = scene.followCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 21;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84; // thumbnail + caption
  inner.getBoundingClientRect = () => ({ left: 20, top: 30, right: 120, bottom: 114 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 20, top: 30, right: 120.5, bottom: 90.25 }),
  }];
  scene.fScroll = 4;
  scene.followFrame();
  assert.equal(els['tw-grid-frame'].style.left, '5px');
  assert.equal(els['tw-grid-frame'].style.top, '17px');
  assert.equal(els['tw-grid-frame'].style.width, '100.5px');
  assert.equal(els['tw-grid-frame'].style.height, '60.25px');
});

test('Following live selection frame converts scaled rects back to stage coordinates', () => {
  const { scene, els, MODE } = setup({ live: [stream('solo')], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  const inner = scene.followCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 21;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84;
  inner.getBoundingClientRect = () => ({ left: 10, top: 20, right: 60, bottom: 62 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 10, top: 20, right: 60.25, bottom: 50.125 }),
  }];
  scene.fScroll = 4;
  scene.followFrame();
  assert.equal(els['tw-grid-frame'].style.left, '5px');
  assert.equal(els['tw-grid-frame'].style.top, '17px');
  assert.equal(els['tw-grid-frame'].style.width, '100.5px');
  assert.equal(els['tw-grid-frame'].style.height, '60.25px');
});

test('Following section frame converts scaled section top back to stage coordinates', () => {
  const { scene, els, MODE } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [stream('solo')],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fr = 1;
  scene.fc = 0;
  scene.fScroll = 462;
  els['tw-follow'].getBoundingClientRect = () => ({ top: 100, left: 0, right: 100, bottom: 600 });
  const inner = scene.followCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84;
  inner.getBoundingClientRect = () => ({ left: 10, top: 360.5, right: 60, bottom: 402.5 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 10, top: 360.5, right: 60.25, bottom: 390.625 }),
  }];
  scene.followFrame();
  assert.equal(els['tw-grid-frame'].style.left, '5px');
  assert.equal(els['tw-grid-frame'].style.top, '59px');
  assert.equal(els['tw-grid-frame'].style.width, '100.5px');
  assert.equal(els['tw-grid-frame'].style.height, '60.25px');
});

test('Following live selection frame subtracts the row-local table offset', () => {
  const { scene, els, MODE } = setup({
    live: [stream('a'), stream('b'), stream('c'), stream('d'), stream('e')],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fr = 1;
  scene.fc = 0;
  scene.fRows[1].el.offsetTop = 200;
  const inner = scene.followCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 221;        // table-local: row offset + cell padding
  inner.offsetWidth = 100;
  inner.offsetHeight = 84;
  inner.getBoundingClientRect = () => ({ left: 20, top: 30, right: 120, bottom: 114 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 20, top: 30, right: 120, bottom: 90 }),
  }];
  scene.fScroll = 154;
  scene.followFrame();
  assert.equal(els['tw-grid-frame'].style.top, '67px');
});

test('Following offline channel focus hides the floating frame', () => {
  const { scene, els, MODE, KEY } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [],
    follows: [channel('offguy')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(els['tw-grid-frame'].style.opacity, '1');
  scene.handleFollowKey(KEY.DOWN);
  assert.match(scene.followCell().firstChild.className, /tw-focused/);
  assert.equal(els['tw-grid-frame'].style.opacity, '0');
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

test('game stream lists render a category header above the grid', () => {
  const { scene, els, MODE } = setup({
    games: [game('Chess')],
    gameStreams: [stream('a')],
    categoryInfo: {
      kind: 'game',
      name: 'Chess',
      display: 'Chess',
      viewers: 1234,
      followers: 9876,
      description: 'A strategic board game.',
      box: 'http://img/chess.jpg',
    },
  });
  scene.switchMode(MODE.GAMES, true);
  scene.activate();
  assert.equal(scene.mode, MODE.GAMES_STREAMS);
  assert.match(els['tw-grid-wrap'].className, /tw-grid-wrap-category/);
  assert.equal(els['tw-category-head'].style.display, 'block');
  assert.equal(els['tw-category-name'].textContent, 'Chess');
  assert.equal(els['tw-category-stats'].textContent, 'CATEGORY_VIEWERS:1234 | CATEGORY_FOLLOWERS:9876');
  assert.equal(els['tw-category-desc'].textContent, 'A strategic board game.');
});

test('category stream selection frame accounts for the fixed header', () => {
  const { scene, els, MODE } = setup({ games: [game('Chess')], gameStreams: [stream('solo')] });
  scene.switchMode(MODE.GAMES, true);
  scene.activate();
  els['tw-grid-scroll'].offsetTop = 174;
  const inner = scene.focusedCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 9;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84;
  inner.getBoundingClientRect = () => ({ left: 20, top: 30, right: 120, bottom: 114 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 20, top: 30, right: 120, bottom: 90 }),
  }];
  scene.updateFrame();
  assert.equal(els['tw-grid-frame'].style.top, '183px');
});

test('category stream header scrolls with the grid content', () => {
  const { scene, els, MODE } = setup({
    games: [game('Chess')],
    gameStreams: [stream('a'), stream('b'), stream('c'), stream('d'), stream('e')],
  });
  scene.switchMode(MODE.GAMES, true);
  scene.activate();
  scene.rowEls[1].offsetTop = 240;
  scene.move(0, 1);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-240px,0)');
  assert.equal(els['tw-category-head'].style.transform, 'translate3d(0,-240px,0)');
});

test('returning from another scene preserves the current browser mode', () => {
  const { scene, els, MODE } = setup({ games: [game('Chess')] });
  scene.switchMode(MODE.GAMES, true);
  assert.equal(scene.mode, MODE.GAMES);
  assert.equal(scene.items.length, 1);
  scene.handleHide();
  scene.handleShow();
  scene.handleFocus();
  assert.equal(scene.mode, MODE.GAMES);
  assert.equal(scene.items.length, 1);
  assert.match(els['tw-grid-wrap'].className, /tw-grid-wrap-games/);
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

test('Following pins a sparse bottom row instead of clamping it to the viewport bottom', () => {
  const { scene, els, MODE } = setup({
    live: [],
    follows: [channel('a'), channel('b'), channel('c'), channel('d'), channel('e'), channel('f'), channel('g')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  els['tw-follow'].offsetHeight = 1000;
  els['tw-grid-wrap'].clientHeight = 600;
  scene.fRows[1].el.offsetTop = 900;
  scene.fr = 1;
  scene.followScrollTo();
  assert.equal(scene.fScroll, 854);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-854px,0)');
});

test('Following scroll uses each row position in the full sectioned view', () => {
  const { scene, els, MODE, KEY } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [],
    follows: [channel('a'), channel('b')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows[0].items[0].kind, 'game');
  assert.equal(scene.fRows[1].items[0].kind, 'channel');

  var offlineTable = scene.fRows[1].el.parentNode;
  var offlineSection = offlineTable.parentNode;
  scene.fRows[1].el.offsetTop = 0;      // first row inside its own table
  offlineTable.offsetTop = 38;          // section heading before the table
  offlineSection.offsetTop = 470;       // category section above it

  scene.handleFollowKey(KEY.DOWN);
  assert.equal(scene.fr, 1);
  assert.equal(scene.fScroll, 462);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-462px,0)');
});

test('Following row positioning uses same-space rects to avoid double-counting sections', () => {
  const { scene, els, MODE } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [],
    follows: [channel('a')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  var offlineTable = scene.fRows[1].el.parentNode;
  var offlineSection = offlineTable.parentNode;
  scene.fRows[1].el.offsetTop = 0;
  offlineTable.offsetTop = 508;         // table offset is already section-relative in real layout
  offlineSection.offsetTop = 470;       // parent-chain summing would wrongly add this again
  scene.fRows[1].el.getBoundingClientRect = () => ({ top: -665, left: 0, right: 100, bottom: -605 });
  els['tw-follow'].getBoundingClientRect = () => ({ top: -1173, left: 0, right: 100, bottom: -155 });

  scene.fr = 1;
  scene.followScrollTo();
  assert.equal(scene.fScroll, 462);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-462px,0)');
});

test('Following row positioning converts scaled section rects back to stage coordinates', () => {
  const { scene, els, MODE } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [],
    follows: [channel('a')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fRows[1].el.offsetHeight = 60;
  scene.fRows[1].el.getBoundingClientRect = () => ({ top: 354, left: 0, right: 100, bottom: 384 });
  els['tw-follow'].getBoundingClientRect = () => ({ top: 100, left: 0, right: 100, bottom: 500 });

  scene.fr = 1;
  scene.followScrollTo();
  assert.equal(scene.fScroll, 462);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-462px,0)');
});

test('selecting a live tile opens the player; an offline tile opens the channel page', () => {
  const { scene, calls, MODE } = setup({ live: [stream('liveguy')], follows: [channel('offguy')] });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fr = 0; scene.fc = 0; scene.activateFollow();
  assert.deepEqual(calls.goToChannel, ['liveguy']);
  scene.fr = 1; scene.fc = 0; scene.activateFollow();
  assert.deepEqual(calls.goToChannelPage, ['offguy']);
});

test('selecting a live category enters the shared category stream view', () => {
  const { scene, els, MODE } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10, followers: 20, box: 'http://img/chess.jpg' })],
    live: [stream('liveguy', 'Live Guy')],
    follows: [],
    gameStreams: [stream('other')],
    categoryInfo: { kind: 'game', name: 'Chess', display: 'Chess', viewers: 10, followers: 20, box: 'http://img/chess.jpg' },
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fr = 0; scene.fc = 0; scene.activateFollow();
  assert.equal(scene.mode, MODE.GAMES_STREAMS);
  assert.equal(scene.selectedGame.name, 'Chess');
  assert.equal(els['tw-category-head'].style.display, 'block');
  assert.equal(scene.items.length, 1);
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

test('tab cursor uses rendered vertical bounds without changing horizontal metrics', () => {
  const { scene, els } = setup();
  scene.focusTopNav();

  const tips = els['tw-tips'];
  const box = els['tw-tip-all'].firstChild;
  const cursor = els['tw-tip-cursor'];
  tips.getBoundingClientRect = () => ({ top: 44.5, bottom: 79 });
  box.getBoundingClientRect = () => ({ top: 50, bottom: 79, height: 29 });
  box.offsetLeft = 8;
  box.offsetTop = 6;      // rounded browser offset; rendered top is 5.5px
  box.offsetWidth = 90;
  box.offsetHeight = 29;

  scene.moveTabCursor();

  assert.equal(cursor.style.left, '8px');
  assert.equal(cursor.style.width, '90px');
  assert.equal(cursor.style.top, '5.5px');
  assert.equal(cursor.style.height, '29px');
});

test('tab cursor converts scaled vertical bounds back to stage coordinates', () => {
  const { scene, els } = setup();
  scene.focusTopNav();

  const tips = els['tw-tips'];
  const box = els['tw-tip-all'].firstChild;
  const cursor = els['tw-tip-cursor'];
  tips.getBoundingClientRect = () => ({ top: 100, bottom: 117.25 });
  box.getBoundingClientRect = () => ({ top: 102.75, bottom: 117.25, height: 14.5 });
  box.offsetLeft = 8;
  box.offsetTop = 6;
  box.offsetWidth = 90;
  box.offsetHeight = 29;

  scene.moveTabCursor();

  assert.equal(cursor.style.left, '8px');
  assert.equal(cursor.style.width, '90px');
  assert.equal(cursor.style.top, '5.5px');
  assert.equal(cursor.style.height, '29px');
});

test('BACK on the tab row selects Channels', () => {
  const { scene, els, MODE, KEY } = setup({ streams: [stream('a')], games: [game('Chess')] });
  scene.switchMode(MODE.GAMES, true);
  scene.focusTopNav();
  assert.equal(scene.navIndex, 1, 'Games tab focused');
  scene.handleKeyDown(KEY.BACK);
  assert.equal(scene.mode, MODE.ALL);
  assert.equal(scene.onTopNav, true);
  assert.equal(scene.navIndex, 0);
  assert.match(els['tw-tip-all'].className, /tw-tip-active/);
});
