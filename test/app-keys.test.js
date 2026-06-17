'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadCore } = require('./_load');

test('mapped keydowns always suppress browser defaults', () => {
  let keydown;
  const document = {
    addEventListener(type, handler) {
      if (type === 'keydown') { keydown = handler; }
    },
    getElementById() { return null; },
  };
  const dispatched = [];
  const g = loadCore(['core/dom.js', 'core/app.js'], {
    document,
    TW: {
      config: { language: 'en' },
      KEY: { BACK: 'BACK' },
      i18n: { setLanguage() {} },
      log: { setSink() {}, info() {}, warn() {} },
      api: { backendName() { return 'test'; } },
      sceneManager: {
        register() {},
        show() {},
        focus() {},
        dispatchKey(key) { dispatched.push(key); return false; },
      },
      BrowserScene: function () {},
      ChannelPageScene: function () {},
      ChannelScene: function () {},
      LoginScene: function () {},
    },
  });

  g.TW.app.start({
    name: 'test',
    keys: { map() { return 'DOWN'; } },
  });

  let prevented = false;
  keydown({ preventDefault() { prevented = true; } });

  assert.deepEqual(dispatched, ['DOWN']);
  assert.equal(prevented, true);
});

test('unhandled Back invokes the platform exit fallback', () => {
  let keydown;
  const document = {
    addEventListener(type, handler) {
      if (type === 'keydown') { keydown = handler; }
    },
    getElementById() { return null; },
  };
  const calls = { exit: 0 };
  const g = loadCore(['core/dom.js', 'core/app.js'], {
    document,
    TW: {
      config: { language: 'en' },
      KEY: { BACK: 'BACK' },
      i18n: { setLanguage() {} },
      log: { setSink() {}, info() {}, warn() {} },
      api: { backendName() { return 'test'; } },
      sceneManager: {
        register() {},
        show() {},
        focus() {},
        dispatchKey(key) { return key !== 'BACK'; },
      },
      BrowserScene: function () {},
      ChannelPageScene: function () {},
      ChannelScene: function () {},
      LoginScene: function () {},
    },
  });

  g.TW.app.start({
    name: 'test',
    keys: { map() { return 'BACK'; } },
    system: { exit() { calls.exit++; } },
  });

  let prevented = false;
  keydown({ preventDefault() { prevented = true; } });

  assert.equal(calls.exit, 1);
  assert.equal(prevented, true);
});
