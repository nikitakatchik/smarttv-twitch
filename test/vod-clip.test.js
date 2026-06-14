'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, mockXHR } = require('./_load');

function makeApp(responder) {
  const XHR = mockXHR(responder);
  const g = loadCore([
    'core/polyfill.js', 'core/util.js', 'core/config.js', 'core/http.js',
    'core/twitch/usher.js', 'core/twitch/playlist.js', 'core/twitch/gql.js',
    'core/twitch/api.js',
  ], { XMLHttpRequest: XHR });
  return { TW: g.TW, log: XHR.log };
}

test('channelVideos maps the GraphQL VOD shape to normalized items', () => {
  const VIDS = JSON.stringify({ data: { user: { videos: { edges: [
    { cursor: 'v1', node: { id: '111', title: 'My VOD', lengthSeconds: 3661, viewCount: 50, publishedAt: '2026-06-01T00:00:00Z', previewThumbnailURL: 'http://t/1.jpg' } },
  ] } } } });
  const { TW } = makeApp(() => ({ status: 200, text: VIDS }));
  let res = null;
  TW.api.channelVideos('foo', null, (r) => { res = r; }, () => {});
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].kind, 'vod');
  assert.equal(res.items[0].id, '111');
  assert.equal(res.items[0].duration, 3661);
  assert.equal(res.items[0].viewers, 50);
  assert.equal(res.items[0].thumb, 'http://t/1.jpg');
  assert.equal(res.cursor, 'v1');
});

test('channelClips maps the GraphQL clip shape to normalized items', () => {
  const CLIPS = JSON.stringify({ data: { user: { clips: { edges: [
    { cursor: 'c1', node: { slug: 'FunnyClip', title: 'lol', durationSeconds: 12, viewCount: 999, thumbnailURL: 'http://t/c.jpg' } },
  ] } } } });
  const { TW } = makeApp(() => ({ status: 200, text: CLIPS }));
  let res = null;
  TW.api.channelClips('foo', null, (r) => { res = r; }, () => {});
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].kind, 'clip');
  assert.equal(res.items[0].slug, 'FunnyClip');
  assert.equal(res.items[0].duration, 12);
  assert.equal(res.items[0].viewers, 999);
  assert.equal(res.cursor, 'c1');
});

test('vodPlaybackUrl builds a usher /vod/ master URL from the access token', () => {
  const TOK = JSON.stringify({ data: { videoPlaybackAccessToken: { value: '{"vod":1}', signature: 'sigVOD' } } });
  const { TW } = makeApp(() => ({ status: 200, text: TOK }));
  let url = null;
  TW.api.vodPlaybackUrl('999', (u) => { url = u; }, () => {});
  assert.match(url, /usher\.ttvnw\.net\/vod\/999\.m3u8/);
  assert.match(url, /sig=sigVOD/);
  assert.match(url, /token=/);
});

test('clipPlayback signs every quality MP4 with sig + token', () => {
  const CLIP = JSON.stringify({ data: { clip: {
    playbackAccessToken: { value: 'CTOK', signature: 'CSIG' },
    videoQualities: [
      { frameRate: 60, quality: '1080', sourceURL: 'https://x.cloudfront.net/a.mp4' },
      { frameRate: 30, quality: '480', sourceURL: 'https://x.cloudfront.net/b.mp4' },
    ],
  } } });
  const { TW } = makeApp(() => ({ status: 200, text: CLIP }));
  let info = null;
  TW.api.clipPlayback('slug', (i) => { info = i; }, () => {});
  assert.equal(info.qualities.length, 2);
  assert.equal(info.url, 'https://x.cloudfront.net/a.mp4?sig=CSIG&token=CTOK'); // highest first
  assert.match(info.qualities[1].url, /b\.mp4\?sig=CSIG&token=CTOK/);
});

test('clipPlayback fails cleanly when a clip has no playable qualities', () => {
  const EMPTY = JSON.stringify({ data: { clip: { playbackAccessToken: { value: '', signature: '' }, videoQualities: [] } } });
  const { TW } = makeApp(() => ({ status: 200, text: EMPTY }));
  let ok = 0; let failed = 0;
  TW.api.clipPlayback('x', () => { ok++; }, () => { failed++; });
  assert.equal(ok, 0);
  assert.equal(failed, 1);
});

test('usher.buildVod assembles a signed VOD playlist URL', () => {
  const { TW } = makeApp(() => ({ status: 200, text: '{}' }));
  const u = TW.twitch.usher.buildVod('42', { value: 'V', signature: 'S' });
  assert.match(u, /\/vod\/42\.m3u8\?/);
  assert.match(u, /sig=S/);
  assert.match(u, /token=V/);
});
