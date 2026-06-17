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
    'core/twitch/api.js',
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
  assert.equal(result.items[0].game, 'Chess');
  assert.match(result.items[0].thumb, /live_user_alpha/);
  assert.equal(result.cursor, 'c2');
});

test('topGames uses Twitch-provided box art URLs', () => {
  const body = JSON.stringify({ data: { games: { edges: [
    { cursor: 'g1', node: {
      id: '99', name: 'M&M Game', displayName: 'M&M Game', viewersCount: 77,
      boxArtURL: 'https://img/game-285x380.jpg',
    } },
  ] } } });
  const { TW, log } = makeApp(() => ({ status: 200, text: body }));
  let result = null;
  TW.api.topGames(null, (r) => { result = r; }, () => {});
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].box, 'https://img/game-285x380.jpg');
  assert.match(log[log.length - 1].body, /boxArtURL\(width: 285, height: 380\)/);
});

test('categoryInfo maps category metadata for the browse header', () => {
  const body = JSON.stringify({ data: { game: {
    id: '99',
    name: 'Chess',
    displayName: 'Chess',
    viewersCount: 77,
    followersCount: 1234,
    description: 'A strategic board game.',
    boxArtURL: 'https://img/chess-285x380.jpg',
  } } });
  const { TW, log } = makeApp(() => ({ status: 200, text: body }));
  let info = null;
  TW.api.categoryInfo({ name: 'Chess' }, (i) => { info = i; }, () => {});
  assert.equal(info.display, 'Chess');
  assert.equal(info.viewers, 77);
  assert.equal(info.followers, 1234);
  assert.equal(info.description, 'A strategic board game.');
  assert.equal(info.box, 'https://img/chess-285x380.jpg');
  assert.match(log[log.length - 1].body, /followersCount description/);
});

test('followedGames maps followed live categories and filters offline categories', () => {
  const body = JSON.stringify({ data: { user: { followedGames: { nodes: [
    {
      id: '99',
      name: 'Chess',
      displayName: 'Chess',
      viewersCount: 77,
      followersCount: 1234,
      description: 'A strategic board game.',
      boxArtURL: 'https://img/chess-285x380.jpg',
    },
    {
      id: '100',
      name: 'Offline Game',
      displayName: 'Offline Game',
      viewersCount: 0,
      followersCount: 12,
      description: '',
      boxArtURL: 'https://img/offline-285x380.jpg',
    },
  ] } } } });
  const { TW, log } = makeApp(() => ({ status: 200, text: body }));
  let result = null;
  TW.twitch.gql.followedGames('someuser', 100, (r) => { result = r; }, () => {});
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, 'Chess');
  assert.equal(result.items[0].viewers, 77);
  assert.equal(result.items[0].followers, 1234);
  assert.match(log[log.length - 1].body, /followedGames\(first: 100\)/);
});

test('streamInfo maps the current game for the player overlay', () => {
  const body = JSON.stringify({ data: { user: {
    displayName: 'Alpha',
    profileImageURL: 'http://img/alpha.png',
    stream: { title: 'Live now', viewersCount: 321, game: { name: 'Chess' } },
  } } });
  const { TW, log } = makeApp(() => ({ status: 200, text: body }));
  let info = null;
  TW.api.streamInfo('alpha', (i) => { info = i; }, () => {});
  assert.equal(info.display, 'Alpha');
  assert.equal(info.title, 'Live now');
  assert.equal(info.viewers, 321);
  assert.equal(info.game, 'Chess');
  assert.match(log[log.length - 1].body, /game \{ name \}/);
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

test('channelInfo maps the GraphQL user shape to a channel-page header', () => {
  const body = JSON.stringify({ data: { user: {
    login: 'alpha', displayName: 'Alpha', description: 'hello there',
    profileImageURL: 'http://img/alpha.png', followers: { totalCount: 1234 }, stream: null,
  } } });
  const { TW } = makeApp(() => ({ status: 200, text: body }));
  let info = null;
  TW.api.channelInfo('alpha', (i) => { info = i; }, () => {});
  assert.equal(info.display, 'Alpha');
  assert.equal(info.followers, 1234);
  assert.equal(info.avatar, 'http://img/alpha.png');
  assert.equal(info.description, 'hello there');
  assert.equal(info.online, false);
});

test('playbackUrl builds a usher URL from the access token', () => {
  const token = JSON.stringify({ data: { streamPlaybackAccessToken: { value: '{"a":1}', signature: 'sig123' } } });
  const { TW } = makeApp(() => ({ status: 200, text: token }));
  let url = null;
  TW.api.playbackUrl('somechannel', (u) => { url = u; }, () => {});
  assert.match(url, /usher\.ttvnw\.net\/api\/channel\/hls\/somechannel\.m3u8/);
  assert.match(url, /sig=sig123/);
});
