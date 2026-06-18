'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.resolve(__dirname, '..', 'src');

function runFiles(files, globals) {
  const g = Object.assign({}, globals);
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  files.forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), g, { filename: file });
  });
  return g;
}

function runFile(file, globals) {
  return runFiles([file], globals);
}

test('orsay boot starts from legacy non-loading ready states', () => {
  const starts = [];
  const g = runFile('platforms/orsay/boot.js', {
    document: { readyState: 'interactive' },
    TW: {
      delay() { throw new Error('timer should not be needed'); },
      dom: { on() { throw new Error('listener should not be needed'); } },
      platform: { keys: {}, system: {}, createPlayer() {} },
      net: {},
      http: {},
      app: { start(opts) { starts.push(opts); } },
    },
  });

  assert.equal(starts.length, 1);
  assert.equal(starts[0].name, 'orsay');
  assert.equal(g.TW.platform.system, starts[0].system);
  assert.equal(starts[0].auth.enabled, false);
  assert.equal(starts[0].browse.deferInitialLoadMs, 900);
  assert.equal(starts[0].chat.enabled, false);
});

test('orsay boot starts synchronously even while document is still loading', () => {
  const starts = [];
  const listeners = [];
  let loadHandler = null;
  runFile('platforms/orsay/boot.js', {
    document: { readyState: 'loading' },
    TW: {
      delay() { throw new Error('timer should not be needed'); },
      dom: { on(target, type, fn) { listeners.push(type); if (type === 'load') { loadHandler = fn; } } },
      platform: { keys: {}, system: {}, createPlayer() {} },
      net: {},
      http: {},
      app: { start(opts) { starts.push(opts); } },
    },
  });

  assert.deepEqual(listeners, ['DOMContentLoaded', 'load']);
  loadHandler();

  assert.equal(starts.length, 1);
});

test('orsay system ready focuses the key target and sends Samsung ready once', () => {
  let readyCount = 0;
  let focusCount = 0;
  let pluginConstructed = 0;
  const anchor = { focus() { focusCount++; } };
  const g = runFile('platforms/orsay/system.js', {
    document: { getElementById(id) { return id === 'tw-orsay-focus' ? anchor : null; } },
    Common: {
      API: {
        Widget: function () {
          this.sendReadyEvent = function () { readyCount++; };
          this.sendReturnEvent = function () {};
        },
        Plugin: function () { pluginConstructed++; },
      },
    },
    TW: { platform: {}, log: { info() {} } },
  });

  g.TW.platform.system.ready();
  g.TW.platform.system.ready();

  assert.equal(readyCount, 1);
  assert.equal(focusCount, 2);
  assert.equal(g.twOrsayAppReady, true);
  assert.equal(g.twOrsayWidgetReadySent, true);
  assert.equal(pluginConstructed, 0);
  g.TW.platform.system.setScreensaver(true);
  assert.equal(pluginConstructed, 0);
});

test('orsay system does not resend ready after the index fallback already did', () => {
  let readyCount = 0;
  const g = runFile('platforms/orsay/system.js', {
    twOrsayWidgetReadySent: true,
    document: { getElementById() { return null; }, body: { focus() {} } },
    Common: {
      API: {
        Widget: function () {
          this.sendReadyEvent = function () { readyCount++; };
          this.sendReturnEvent = function () {};
        },
      },
    },
    TW: { platform: {}, log: { info() {} } },
  });

  g.TW.platform.system.ready();

  assert.equal(readyCount, 0);
  assert.equal(g.twOrsayAppReady, true);
});

test('orsay keys expose the hidden focus anchor as their legacy key target', () => {
  const anchor = {};
  const g = runFiles(['core/keys.js', 'platforms/orsay/keys.js'], {
    document: { getElementById(id) { return id === 'tw-orsay-focus' ? anchor : null; } },
    TW: {},
  });

  assert.equal(g.TW.platform.keys.target(), anchor);
  assert.equal(g.TW.platform.keys.map({ keyCode: 29443 }), g.TW.KEY.ENTER);
  assert.equal(g.TW.platform.keys.map({ keyCode: 45 }), g.TW.KEY.BACK);
  assert.equal(g.TW.platform.keys.map({ keyCode: 10182 }), g.TW.KEY.BACK);
});

test('orsay index avoids blocking Plugin.js before app scripts', () => {
  const html = fs.readFileSync(path.join(SRC, 'platforms', 'orsay', 'index.html'), 'utf8');

  assert.ok(html.includes('$MANAGER_WIDGET/Common/API/Widget.js'));
  assert.ok(!html.includes('$MANAGER_WIDGET/Common/API/Plugin.js'));
  assert.ok(!html.includes('id="tw-boot-status"'));
  assert.ok(!html.includes('Twellie loading'));
  assert.ok(!html.includes('window.onerror'));
  assert.ok(html.includes('twOrsayAppReady'));
  assert.ok(html.includes('doc.onkeydown'));
});

function createOrsayPlayer(fetchVariants) {
  const plays = [];
  const stops = [];
  const errors = [];
  const plugin = {
    Stop() { stops.push(true); },
    Play(url) { plays.push(url); },
    SetDisplayArea() {},
  };
  const g = runFile('platforms/orsay/player.js', {
    TW: {
      platform: {},
      dom: { get(id) { assert.equal(id, 'tw-orsay-player'); return plugin; } },
      api: { fetchVariants },
      i18n: { t: (k) => k },
      log: { warn() {} },
    },
  });
  const player = g.TW.platform.createPlayer({
    onBufferingStart() {},
    onBufferingProgress() {},
    onBufferingComplete() {},
    onPlaying() {},
    onEnded() {},
    onError(msg) { errors.push(msg); },
  });
  return { player, plays, stops, errors, plugin, TW: g.TW };
}

test('orsay player drops high-fps variants and prefers 720p, 480p, 360p, then 1080p', () => {
  let completeVariants = null;
  const { player, plays } = createOrsayPlayer((url, ok) => {
    assert.equal(url, 'http://video.example/master.m3u8');
    completeVariants = ok;
  });
  let qualities = null;

  player.getQualities((q) => { qualities = Array.prototype.slice.call(q); });
  player.load('http://video.example/master.m3u8');

  assert.deepEqual(plays, ['http://video.example/master.m3u8|COMPONENT=HLS']);
  assert.deepEqual(qualities, ['Auto']);

  completeVariants([
    { name: '1080p60', url: 'http://video.example/1080-60.m3u8', frameRate: 60 },
    { name: '160p', url: 'http://video.example/160.m3u8' },
    { name: '720p50', url: 'http://video.example/720-50.m3u8', frameRate: 50 },
    { name: '360p', url: 'http://video.example/360.m3u8' },
    { name: '480p', url: 'http://video.example/480.m3u8' },
    { name: '1080p', url: 'http://video.example/1080.m3u8' },
    { name: '720p', url: 'http://video.example/720.m3u8' },
  ]);

  assert.deepEqual(qualities, ['Auto', '720p', '480p', '360p', '1080p', '160p']);
  assert.equal(plays[1], 'http://video.example/720.m3u8|COMPONENT=HLS');

  player.selectQuality(0);
  player.selectQuality(2); // 480p
  player.selectQuality(4); // 1080p, below 360p

  assert.equal(plays[2], 'http://video.example/720.m3u8|COMPONENT=HLS');
  assert.equal(plays[3], 'http://video.example/480.m3u8|COMPONENT=HLS');
  assert.equal(plays[4], 'http://video.example/1080.m3u8|COMPONENT=HLS');
});

test('orsay player falls back to 480p when 720p is high frame rate', () => {
  let completeVariants = null;
  const { player, plays } = createOrsayPlayer((url, ok) => {
    completeVariants = ok;
  });
  let qualities = null;

  player.getQualities((q) => { qualities = Array.prototype.slice.call(q); });
  player.load('http://video.example/master.m3u8');
  completeVariants([
    { name: '720p60', url: 'http://video.example/720-60.m3u8', frameRate: 60 },
    { name: '480p', url: 'http://video.example/480.m3u8' },
    { name: '360p', url: 'http://video.example/360.m3u8' },
  ]);

  assert.deepEqual(qualities, ['Auto', '480p', '360p']);
  assert.equal(plays[1], 'http://video.example/480.m3u8|COMPONENT=HLS');
});

test('orsay player retries the next legacy variant before surfacing render errors', () => {
  let completeVariants = null;
  const { player, plays, errors, TW } = createOrsayPlayer((url, ok) => {
    completeVariants = ok;
  });

  player.load('http://video.example/master.m3u8');
  completeVariants([
    { name: '720p60', url: 'http://video.example/720-60.m3u8', frameRate: 60 },
    { name: '480p', url: 'http://video.example/480.m3u8' },
    { name: '360p', url: 'http://video.example/360.m3u8' },
  ]);

  assert.equal(plays[1], 'http://video.example/480.m3u8|COMPONENT=HLS');
  TW.orsayEvents.onRenderError();

  assert.deepEqual(errors, []);
  assert.equal(plays[2], 'http://video.example/360.m3u8|COMPONENT=HLS');

  TW.orsayEvents.onRenderError();

  assert.deepEqual(errors, ['ERROR_RENDER']);
});

test('orsay player downgrades Twitch HLS URLs to http for the native plugin', () => {
  let variantRequest = null;
  let completeVariants = null;
  const { player, plays } = createOrsayPlayer((url, ok) => {
    variantRequest = url;
    completeVariants = ok;
  });

  player.load('https://usher.ttvnw.net/api/channel/hls/zarbex.m3u8?sig=s&token=t');

  assert.equal(variantRequest, 'http://usher.ttvnw.net/api/channel/hls/zarbex.m3u8?sig=s&token=t');
  assert.equal(plays[0], 'http://usher.ttvnw.net/api/channel/hls/zarbex.m3u8?sig=s&token=t|COMPONENT=HLS');

  completeVariants([
    { name: '720p', url: 'https://video-weaver.example.hls.ttvnw.net/v1/playlist/720.m3u8' },
  ]);

  assert.equal(plays[1], 'http://video-weaver.example.hls.ttvnw.net/v1/playlist/720.m3u8|COMPONENT=HLS');
  player.selectQuality(1);
  assert.equal(plays[2], 'http://video-weaver.example.hls.ttvnw.net/v1/playlist/720.m3u8|COMPONENT=HLS');
});

test('orsay player does not switch variants after native playback has started', () => {
  let completeVariants = null;
  const { player, plays, TW } = createOrsayPlayer((url, ok) => { completeVariants = ok; });

  player.load('http://video.example/master.m3u8');
  TW.orsayEvents.onStreamInfoReady();
  completeVariants([{ name: '720p', url: 'http://video.example/720.m3u8' }]);

  assert.deepEqual(plays, ['http://video.example/master.m3u8|COMPONENT=HLS']);
});

test('orsay player falls back to the master playlist when variant parsing fails', () => {
  const { player, plays } = createOrsayPlayer((url, ok, fail) => {
    assert.equal(url, 'http://video.example/master.m3u8');
    fail(0);
  });

  player.load('http://video.example/master.m3u8');

  assert.equal(plays.length, 1);
  assert.equal(plays[0], 'http://video.example/master.m3u8|COMPONENT=HLS');
});
