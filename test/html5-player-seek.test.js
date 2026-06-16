'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeVideo() {
  return {
    currentTime: 190,
    duration: 3600,
    offsetWidth: 1280,
    offsetHeight: 720,
    parentNode: { offsetWidth: 1280, offsetHeight: 720 },
    seekable: {
      length: 1,
      start() { return 180; },
      end() { return 210; },
    },
    style: {},
    canPlayType() { return 'probably'; },
    play() {},
    pause() {},
    removeAttribute() {},
    load() {},
  };
}

function loadPlayer(file, video) {
  const timers = [];
  const g = {
    Hls: null,
    TW: {
      config: { screen: { width: 1280, height: 720 } },
      dom: {
        get() { return video; },
        on() {},
      },
      i18n: { t: (k) => k },
      log: { warn() {} },
      platform: {},
    },
    setTimeout(fn, ms) {
      const id = timers.length + 1;
      timers.push({ fn, ms, active: true });
      return id;
    },
    clearTimeout(id) {
      if (timers[id - 1]) { timers[id - 1].active = false; }
    },
  };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  const code = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  vm.runInContext(code, g, { filename: file });
  const player = g.TW.platform.createPlayer({
    onBufferingStart() {},
    onBufferingProgress() {},
    onBufferingComplete() {},
    onPlaying() {},
    onEnded() {},
    onError() {},
  });
  return {
    player,
    runSeekTimer() {
      const t = timers.find((item) => item.active && item.ms === 280);
      assert.ok(t, 'expected active debounced seek timer');
      t.active = false;
      t.fn();
    },
  };
}

for (const file of ['src/platforms/web/player.js', 'src/platforms/tizenbrew/player.js']) {
  test(`${file} uses absolute VOD time instead of a moving seekable window`, () => {
    const video = makeVideo();
    const { player, runSeekTimer } = loadPlayer(file, video);

    assert.equal(player.getPosition(), 190);
    assert.equal(player.getDuration(), 3600);

    player.seekTo(300);
    assert.equal(player.getPosition(), 300);
    assert.equal(video.currentTime, 190);
    runSeekTimer();
    assert.equal(video.currentTime, 300);

    player.seekTo(9999);
    assert.equal(player.getPosition(), 3600);
    assert.equal(video.currentTime, 300);
    runSeekTimer();
    assert.equal(video.currentTime, 3600);
  });

  test(`${file} coalesces rapid VOD seeks before touching the media element`, () => {
    const video = makeVideo();
    const { player, runSeekTimer } = loadPlayer(file, video);

    player.seekTo(220);
    player.seekTo(260);
    player.seekTo(310);

    assert.equal(player.getPosition(), 310);
    assert.equal(video.currentTime, 190);

    runSeekTimer();
    assert.equal(video.currentTime, 310);
  });

  test(`${file} can commit a pending VOD seek immediately`, () => {
    const video = makeVideo();
    const { player } = loadPlayer(file, video);

    player.seekTo(260);

    assert.equal(player.getPosition(), 260);
    assert.equal(video.currentTime, 190);

    player.commitSeek();
    assert.equal(video.currentTime, 260);
  });

  test(`${file} starts VOD playback from absolute zero`, () => {
    const video = makeVideo();
    const { player } = loadPlayer(file, video);

    player.load('https://example.test/vod/123/index.m3u8');
    video.onloadedmetadata();

    assert.equal(video.currentTime, 0);
  });
}
