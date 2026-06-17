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
