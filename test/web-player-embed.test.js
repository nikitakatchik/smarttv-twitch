'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeVideo(parent) {
  return {
    currentTime: 0,
    duration: 3600,
    offsetWidth: 1280,
    offsetHeight: 720,
    parentNode: parent,
    style: {},
    canPlayType() { return ''; },
    play() {},
    pause() {},
    removeAttribute() {},
    load() {},
  };
}

function makeEmbed(parent) {
  return {
    innerHTML: '',
    offsetWidth: 1280,
    offsetHeight: 720,
    parentNode: parent,
    style: {},
  };
}

function loadPlayer(opts) {
  opts = opts || {};
  const parent = { offsetWidth: opts.parentWidth || 1280, offsetHeight: opts.parentHeight || 720 };
  const video = makeVideo(parent);
  const embed = makeEmbed(parent);
  const timers = [];
  const instances = [];
  const callbackLog = [];

  function FakePlayer(id, options) {
    this.id = id;
    this.options = options;
    this.listeners = {};
    this.currentTime = 12;
    this.duration = 3600;
    this.quality = 'auto';
    this.seekCalls = [];
    this.pauseCalls = 0;
    this.playCalls = 0;
    instances.push(this);
  }
  FakePlayer.PLAY = 'play';
  FakePlayer.PLAYING = 'playing';
  FakePlayer.ENDED = 'ended';
  FakePlayer.OFFLINE = 'offline';
  FakePlayer.PLAYBACK_BLOCKED = 'blocked';
  FakePlayer.prototype.addEventListener = function (name, fn) {
    this.listeners[name] = fn;
  };
  FakePlayer.prototype.getCurrentTime = function () {
    return this.currentTime;
  };
  FakePlayer.prototype.getDuration = function () {
    return this.duration;
  };
  FakePlayer.prototype.seek = function (seconds) {
    this.currentTime = seconds;
    this.seekCalls.push(seconds);
  };
  FakePlayer.prototype.pause = function () {
    this.pauseCalls++;
  };
  FakePlayer.prototype.play = function () {
    this.playCalls++;
  };

  const g = {
    Hls: null,
    Twitch: { Player: FakePlayer },
    location: { hostname: 'nkatchik.github.io' },
    TW: {
      config: { screen: { width: 1280, height: 720 } },
      dom: {
        get(id) { return id === 'tw-embed' ? embed : video; },
        on() {},
      },
      i18n: { t: (k) => k },
      platform: { useEmbedPlayer: true, proxyBase: '' },
    },
    setTimeout(fn, ms) {
      const id = timers.length + 1;
      timers.push({ fn, ms, active: true });
      return id;
    },
    clearTimeout(id) {
      if (timers[id - 1]) { timers[id - 1].active = false; }
    },
    encodeURIComponent,
    decodeURIComponent,
    parseFloat,
    Math,
    String,
  };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  for (const file of ['src/platforms/web/embed-player.js', 'src/platforms/web/player.js']) {
    const code = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    vm.runInContext(code, g, { filename: file });
  }
  const player = g.TW.platform.createPlayer({
    onBufferingStart() { callbackLog.push('buffering'); },
    onBufferingProgress() {},
    onBufferingComplete() { callbackLog.push('buffered'); },
    onPlaying() { callbackLog.push('playing'); },
    onEnded() { callbackLog.push('ended'); },
    onError(msg) { callbackLog.push('error:' + msg); },
  });
  return {
    player,
    video,
    embed,
    instances,
    callbackLog,
    runSeekTimer() {
      const t = timers.find((item) => item.active && item.ms === 280);
      assert.ok(t, 'expected active debounced seek timer');
      t.active = false;
      t.fn();
    },
  };
}

test('static web player embeds live channels with the Pages parent domain', () => {
  const { player, video, embed, instances, callbackLog } = loadPlayer();

  player.load('https://usher.ttvnw.net/api/channel/hls/dallas.m3u8?token=x', {
    kind: 'live',
    login: 'dallas',
  });

  assert.equal(instances.length, 1);
  assert.equal(instances[0].id, 'tw-embed');
  assert.equal(instances[0].options.channel, 'dallas');
  assert.equal(instances[0].options.parent.length, 1);
  assert.equal(instances[0].options.parent[0], 'nkatchik.github.io');
  assert.equal(video.style.display, 'none');
  assert.equal(embed.style.display, 'block');

  instances[0].listeners[FakePlayingEvent()]();
  assert.deepEqual(callbackLog, ['buffered', 'playing']);

  let qualities = null;
  player.getQualities((list) => { qualities = list; });
  assert.equal(qualities.length, 1);
  assert.equal(qualities[0], 'Auto');
});

test('static web player embeds VODs and keeps adapter seek controls', () => {
  const { player, instances, runSeekTimer } = loadPlayer();

  player.load('https://usher.ttvnw.net/vod/123.m3u8?token=x', {
    kind: 'vod',
    id: '123',
  });

  assert.equal(instances[0].options.video, 'v123');
  assert.equal(player.canSeek(), true);
  assert.equal(player.getDuration(), 3600);
  assert.equal(player.getPosition(), 12);

  player.seekTo(44);
  assert.equal(player.getPosition(), 44);
  assert.deepEqual(instances[0].seekCalls, []);
  runSeekTimer();
  assert.deepEqual(instances[0].seekCalls, [44]);
});

test('web player display area stays in logical stage coordinates when preview is scaled', () => {
  const { player, video, embed } = loadPlayer({ parentWidth: 640, parentHeight: 360 });

  player.setDisplayArea(0, 0, 1280, 720);
  assert.equal(video.style.left, '0px');
  assert.equal(video.style.top, '0px');
  assert.equal(video.style.width, '1280px');
  assert.equal(video.style.height, '720px');
  assert.equal(embed.style.width, '1280px');
  assert.equal(embed.style.height, '720px');

  player.setDisplayArea(0, 101, 920, 518);
  assert.equal(video.style.top, '101px');
  assert.equal(video.style.width, '920px');
  assert.equal(video.style.height, '518px');
});

function FakePlayingEvent() {
  return 'playing';
}
