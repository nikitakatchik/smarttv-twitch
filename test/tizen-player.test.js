'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPlayer() {
  const rects = [];
  const av = {
    open() {},
    setDisplayRect(x, y, w, h) { rects.push([x, y, w, h]); },
    setStreamingProperty() {},
    setListener() {},
    prepareAsync(ok) { ok(); },
    play() {},
    stop() {},
    close() {},
    getTotalTrackInfo() { return []; },
  };
  const g = {
    webapis: { avplay: av },
    TW: {
      config: { screen: { width: 1280, height: 720 } },
      i18n: { t: (k) => k },
      log: { warn() {}, info() {} },
      platform: {},
    },
  };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'src/platforms/tizen/player.js'), 'utf8');
  vm.runInContext(code, g, { filename: 'src/platforms/tizen/player.js' });
  const player = g.TW.platform.createPlayer({
    onBufferingStart() {},
    onBufferingProgress() {},
    onBufferingComplete() {},
    onPlaying() {},
    onEnded() {},
    onError() {},
  });
  return { player, rects };
}

test('tizen AVPlay rects scale from logical UI coordinates to native panel pixels', () => {
  const { player, rects } = loadPlayer();

  player.load('https://example.test/master.m3u8');
  assert.deepEqual(rects[0], [0, 0, 1920, 1080]);

  player.setDisplayArea(0, 101, 920, 518);
  assert.deepEqual(rects[1], [0, 152, 1380, 777]);
});
