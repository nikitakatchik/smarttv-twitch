'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./_load');

const g = loadCore(['core/polyfill.js', 'core/util.js', 'core/twitch/playlist.js']);
const parse = g.TW.twitch.playlist.parseMaster;

const MASTER = [
  '#EXTM3U',
  '#EXT-X-TWITCH-INFO:NODE="video-edge-1.ttvnw.net"',
  '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked",NAME="1080p60 (source)",AUTOSELECT=YES,DEFAULT=YES',
  '#EXT-X-STREAM-INF:BANDWIDTH=8042999,RESOLUTION=1920x1080,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="chunked",FRAME-RATE=60.000',
  'https://video-weaver.fra02.hls.ttvnw.net/v1/playlist/chunked.m3u8',
  '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="720p60",NAME="720p60",AUTOSELECT=YES,DEFAULT=NO',
  '#EXT-X-STREAM-INF:BANDWIDTH=3322199,RESOLUTION=1280x720,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="720p60",FRAME-RATE=60.000',
  'https://video-weaver.fra02.hls.ttvnw.net/v1/playlist/720p60.m3u8',
].join('\n');

test('parses every variant in order', () => {
  const v = parse(MASTER);
  assert.equal(v.length, 2);
  assert.equal(v[0].name, '1080p60 (source)');
  assert.equal(v[1].name, '720p60');
});

test('extracts stream-inf attributes', () => {
  const v = parse(MASTER);
  assert.equal(v[0].bandwidth, 8042999);
  assert.equal(v[0].resolution, '1920x1080');
  assert.equal(v[0].frameRate, 60);
  assert.match(v[0].url, /chunked\.m3u8$/);
});

test('handles CRLF and ignores #EXT-X-TWITCH-* noise', () => {
  const v = parse(MASTER.replace(/\n/g, '\r\n'));
  assert.equal(v.length, 2);
  assert.equal(v[0].resolution, '1920x1080');
});

test('empty / non-playlist input yields no variants', () => {
  assert.equal(parse('').length, 0);
  assert.equal(parse('not a playlist').length, 0);
});
