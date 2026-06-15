'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The login scene is DOM-heavy; rather than a full DOM, stub TW.dom so we can
// exercise the state machine (which view, which callbacks) directly. Focused on
// the device-code flow routing and the "don't yank the user after BACK" guard.
function setup(opts) {
  opts = opts || {};
  const els = {};
  function el() { return { style: {}, className: '', textContent: '', innerHTML: '', appendChild() {}, querySelectorAll() { return []; } }; }
  const get = (id) => (els[id] || (els[id] = el()));
  const calls = { startDeviceFlow: null, goToBrowser: [], qr: [], view: null, account: false };

  const TW = {
    dom: {
      create: () => el(),
      get,
      text(e, t) { if (e) { e.textContent = t; } },
      attr() {}, addClass() {}, removeClass() {}, show() {}, hide() {},
    },
    KEY: { BACK: 'back', ENTER: 'enter', UP: 'up', DOWN: 'down' },
    i18n: { t: (k) => k },
    qrcode: (uri) => { calls.qr.push(uri); return { count: 1, isDark: () => false }; },
    auth: {
      SCOPES: ['user:read:follows'],
      isLoggedIn: () => !!opts.loggedIn,
      clientId: () => (opts.clientId === undefined ? 'CID' : opts.clientId),
      user: () => ({ display: 'Me', login: 'me' }),
      startDeviceFlow: (scopes, cb) => { calls.startDeviceFlow = cb; },
      logout: (cb) => cb && cb(),
    },
    app: { goToBrowser: (m) => calls.goToBrowser.push(m) },
    BrowserScene: { MODE: { ALL: 0, FOLLOWED: 4 } },
    sceneManager: { focusedName: () => (opts.focused === undefined ? 'login' : opts.focused) },
  };
  // track the active view by wrapping setView via the prototype after load
  const g = { TW, window: null, document: { body: el() }, Math, JSON };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'src/core/scenes/login-scene.js'), 'utf8');
  vm.runInContext(code, g, { filename: 'login-scene.js' });
  const scene = new TW.LoginScene({});
  scene.initialize();
  return { scene, calls, TW };
}

test('logged in -> account view on focus', () => {
  const { scene } = setup({ loggedIn: true });
  scene.handleFocus();
  assert.equal(scene.view, 'account');
});

test('logged out -> goes straight to the device code (pending) and requests a flow', () => {
  const { scene, calls } = setup({ loggedIn: false });
  scene.handleFocus();
  assert.equal(scene.view, 'pending');
  assert.ok(calls.startDeviceFlow, 'a device flow was started');
});

test('onCode renders a QR of the verification URI', () => {
  const { scene, calls } = setup({ loggedIn: false });
  scene.handleFocus();
  calls.startDeviceFlow.onCode({ verification_uri: 'https://twitch.tv/activate?device-code=AAAA', user_code: 'AAAA' });
  assert.deepEqual(calls.qr, ['https://twitch.tv/activate?device-code=AAAA']);
});

test('onSuccess while focused on login navigates to the Followed tab', () => {
  const { scene, calls } = setup({ loggedIn: false, focused: 'login' });
  scene.handleFocus();
  calls.startDeviceFlow.onSuccess();
  assert.deepEqual(calls.goToBrowser, [4], 'went to FOLLOWED');
  assert.equal(scene.flowActive, false);
});

test('onSuccess after the user navigated away does NOT yank them back', () => {
  const { scene, calls } = setup({ loggedIn: false, focused: 'browser' });
  scene.handleFocus();
  calls.startDeviceFlow.onSuccess();
  assert.deepEqual(calls.goToBrowser, [], 'no navigation when login is not focused');
  assert.equal(scene.flowActive, false);
});

test('an in-flight flow is not restarted when re-focusing', () => {
  const { scene, calls } = setup({ loggedIn: false });
  scene.handleFocus();
  const first = calls.startDeviceFlow;
  scene.handleFocus(); // navigate out and back
  assert.equal(calls.startDeviceFlow, first, 'same flow, not a fresh device request');
});
