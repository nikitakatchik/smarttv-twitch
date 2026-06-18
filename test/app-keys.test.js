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
  const evt = { preventDefault() { prevented = true; } };
  const result = keydown(evt);

  assert.deepEqual(dispatched, ['DOWN']);
  assert.equal(prevented, true);
  assert.equal(evt.cancelBubble, true);
  assert.equal(evt.returnValue, false);
  assert.equal(result, false);
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

test('legacy key target receives the same native key handler', () => {
  let keydown;
  const target = {};
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
        dispatchKey(key) { dispatched.push(key); return true; },
      },
      BrowserScene: function () {},
      ChannelPageScene: function () {},
      ChannelScene: function () {},
      LoginScene: function () {},
    },
  });

  g.TW.app.start({
    name: 'test',
    keys: { map() { return 'ENTER'; }, target() { return target; } },
  });

  assert.equal(typeof keydown, 'function');
  assert.equal(typeof target.onkeydown, 'function');

  let prevented = false;
  let stopped = false;
  const evt = {
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
  };
  const result = target.onkeydown(evt);

  assert.deepEqual(dispatched, ['ENTER']);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(evt.cancelBubble, true);
  assert.equal(evt.returnValue, false);
  assert.equal(result, false);
});

test('platform ready hook runs after the initial browser focus', () => {
  const document = {
    addEventListener() {},
    getElementById() { return null; },
  };
  const order = [];
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
        show(name) { order.push('show:' + name); },
        focus(name) { order.push('focus:' + name); },
        dispatchKey() { return true; },
      },
      BrowserScene: function () {},
      ChannelPageScene: function () {},
      ChannelScene: function () {},
      LoginScene: function () {},
    },
  });

  g.TW.app.start({
    name: 'test',
    keys: { map() { return null; } },
    system: { ready() { order.push('ready'); } },
  });

  assert.deepEqual(order, ['show:browser', 'focus:browser', 'ready']);
});
