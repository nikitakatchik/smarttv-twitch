'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runBoot(url) {
  const u = new URL(url);
  const starts = [];
  const g = {
    location: {
      protocol: u.protocol,
      host: u.host,
      hostname: u.hostname,
      search: u.search,
    },
    document: { readyState: 'complete' },
    encodeURIComponent,
    decodeURIComponent,
    RegExp,
    console: { log() {} },
    TW: {
      platform: {
        keys: {},
        system: {},
        createPlayer() {},
      },
      net: {},
      dom: { on() {} },
      app: {
        start(opts) { starts.push(opts); },
      },
    },
  };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'src/platforms/web/boot.js'), 'utf8');
  vm.runInContext(code, g, { filename: 'platforms/web/boot.js' });
  return { TW: g.TW, starts };
}

test('web boot defaults to the dev proxy on localhost', () => {
  const { TW, starts } = runBoot('http://localhost:8080/');

  assert.equal(starts.length, 1);
  assert.equal(TW.platform.proxyBase, 'http://localhost:8080');
  assert.equal(TW.platform.useEmbedPlayer, false);
  assert.equal(
    TW.net.rewrite('https://api.twitch.tv/helix/users'),
    'http://localhost:8080/proxy?url=https%3A%2F%2Fapi.twitch.tv%2Fhelix%2Fusers'
  );
});

test('web boot uses the embed fallback on static GitHub Pages', () => {
  const { TW } = runBoot('https://nikitakatchik.github.io/smarttv-twitch/');

  assert.equal(TW.platform.proxyBase, '');
  assert.equal(TW.platform.useEmbedPlayer, true);
  assert.equal(
    TW.net.rewrite('https://api.twitch.tv/helix/users'),
    'https://api.twitch.tv/helix/users'
  );
});

test('web boot honors an explicit proxy override on static hosts', () => {
  const { TW } = runBoot('https://nikitakatchik.github.io/smarttv-twitch/?proxy=https%3A%2F%2Fproxy.example');

  assert.equal(TW.platform.proxyBase, 'https://proxy.example');
  assert.equal(TW.platform.useEmbedPlayer, false);
  assert.equal(
    TW.net.rewrite('https://api.twitch.tv/helix/users'),
    'https://proxy.example/proxy?url=https%3A%2F%2Fapi.twitch.tv%2Fhelix%2Fusers'
  );
});
