'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, mockXHR } = require('./_load');

const STREAMS = JSON.stringify({
  data: {
    streams: {
      edges: [
        { cursor: 'c1', node: { id: '1', title: 'T1', viewersCount: 100, broadcaster: { login: 'alpha', displayName: 'Alpha' }, game: { name: 'Chess' } } },
        { cursor: 'c2', node: { id: '2', title: 'T2', viewersCount: 200, broadcaster: { login: 'beta', displayName: 'Beta' }, game: { name: 'Go' } } },
      ],
    },
  },
});

function makeApp(responder) {
  const XHR = mockXHR(responder);
  const g = loadCore([
    'core/polyfill.js', 'core/util.js', 'core/config.js', 'core/http.js',
    'core/twitch/usher.js', 'core/twitch/playlist.js', 'core/twitch/gql.js',
    'core/twitch/helix.js', 'core/twitch/api.js',
  ], { XMLHttpRequest: XHR });
  return { TW: g.TW, log: XHR.log };
}

test('topStreams maps the GraphQL shape to normalized items', () => {
  const { TW } = makeApp(() => ({ status: 200, text: STREAMS }));
  let result = null;
  TW.api.topStreams(null, (r) => { result = r; }, () => {});
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].login, 'alpha');
  assert.equal(result.items[0].display, 'Alpha');
  assert.equal(result.items[0].viewers, 100);
  assert.match(result.items[0].thumb, /live_user_alpha/);
  assert.equal(result.cursor, 'c2');
});

test('requests are capped at GraphQL first:30', () => {
  const { TW, log } = makeApp(() => ({ status: 200, text: STREAMS }));
  TW.config.pageSize = 100; // a Kraken-era value
  TW.api.topStreams(null, () => {}, () => {});
  const body = log[log.length - 1].body;
  assert.match(body, /first: 30/);
  assert.doesNotMatch(body, /first: 100/);
});

test('a GraphQL error response triggers onFail, not an empty success', () => {
  const errBody = JSON.stringify({ data: { streams: null }, errors: [{ message: "argument 'first'..." }] });
  const { TW } = makeApp(() => ({ status: 200, text: errBody }));
  let ok = 0; let failed = 0;
  TW.api.topStreams(null, () => { ok++; }, () => { failed++; });
  assert.equal(ok, 0);
  assert.equal(failed, 1);
});

test('playbackUrl builds a usher URL from the access token', () => {
  const token = JSON.stringify({ data: { streamPlaybackAccessToken: { value: '{"a":1}', signature: 'sig123' } } });
  const { TW } = makeApp(() => ({ status: 200, text: token }));
  let url = null;
  TW.api.playbackUrl('somechannel', (u) => { url = u; }, () => {});
  assert.match(url, /usher\.ttvnw\.net\/api\/channel\/hls\/somechannel\.m3u8/);
  assert.match(url, /sig=sig123/);
});
