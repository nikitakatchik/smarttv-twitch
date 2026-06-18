'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./_load');

// A scriptable TW.net: routes by URL substring, records every send. Each route
// is { status, json } (or a function(opts) returning one).
function netMock(routes) {
  const sent = [];
  const net = {
    sent,
    rewrite: (u) => u,
    send(opts, onDone) {
      sent.push(opts);
      const u = opts.url;
      let r;
      if (u.indexOf('/channels/followed') >= 0) { r = pick(routes.channels, opts); }
      else if (u.indexOf('/streams/followed') >= 0) { r = pick(routes.streams, opts); }
      else if (u.indexOf('/validate') >= 0) { r = pick(routes.validate, opts); }
      else if (u.indexOf('/users') >= 0) { r = pick(routes.users, opts); }
      else { r = { status: 404, json: {} }; }
      onDone(r.status, JSON.stringify(r.json));
    },
  };
  return net;
}
function pick(route, opts) { return typeof route === 'function' ? route(opts) : route; }

function loadHelix(net) {
  const g = loadCore([
    'core/polyfill.js', 'core/util.js', 'core/config.js', 'core/storage.js',
    'core/net.js', 'core/twitch/auth.js', 'core/twitch/helix.js',
  ], {});
  g.TW.net = net;
  // Stand in for a logged-in user so helix skips the /users identity lookup.
  g.TW.storage.set('auth.access', 'AT');
  g.TW.storage.set('auth.uid', '42');
  g.TW.storage.set('auth.scopes', 'user:read:follows');
  g.TW.config.api.userClientId = 'CID';
  return g.TW;
}

test('followedChannels maps follows and merges avatars from a single /users call', () => {
  const net = netMock({
    channels: { status: 200, json: {
      data: [
        { broadcaster_id: '1', broadcaster_login: 'a', broadcaster_name: 'A' },
        { broadcaster_id: '2', broadcaster_login: 'b', broadcaster_name: 'B' },
      ],
      pagination: { cursor: 'cur' },
    } },
    users: { status: 200, json: { data: [
      { id: '1', login: 'a', profile_image_url: 'http://img/a.png' },
      { id: '2', login: 'b', profile_image_url: 'http://img/b.png' },
    ] } },
  });
  const TW = loadHelix(net);
  let res = null;
  TW.twitch.helix.followedChannels(null, (r) => { res = r; }, () => {});

  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].kind, 'channel');
  assert.equal(res.items[0].login, 'a');
  assert.equal(res.items[0].display, 'A');
  assert.equal(res.items[0].avatar, 'http://img/a.png');
  assert.equal(res.items[1].avatar, 'http://img/b.png');
  assert.equal(res.cursor, 'cur');

  // Avatars are batched into ONE /users request covering both ids.
  const userReqs = net.sent.filter((s) => s.url.indexOf('/users') >= 0);
  assert.equal(userReqs.length, 1);
  assert.match(userReqs[0].url, /id=1/);
  assert.match(userReqs[0].url, /id=2/);
});

test('followedChannels still returns the channels when the avatar lookup fails', () => {
  const net = netMock({
    channels: { status: 200, json: {
      data: [{ broadcaster_id: '1', broadcaster_login: 'a', broadcaster_name: 'A' }],
      pagination: {},
    } },
    users: { status: 500, json: {} },
  });
  const TW = loadHelix(net);
  let res = null;
  TW.twitch.helix.followedChannels(null, (r) => { res = r; }, () => {});

  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].avatar, '');   // graceful: tile falls back to a placeholder
  assert.equal(res.cursor, null);
});

test('followedChannels passes the user_id and pagination cursor through', () => {
  const net = netMock({
    channels: { status: 200, json: { data: [], pagination: {} } },
    users: { status: 200, json: { data: [] } },
  });
  const TW = loadHelix(net);
  TW.twitch.helix.followedChannels('CURSOR123', () => {}, () => {});
  const req = net.sent.find((s) => s.url.indexOf('/channels/followed') >= 0);
  assert.match(req.url, /user_id=42/);
  assert.match(req.url, /after=CURSOR123/);
});

test('followedStreams resolves a missing user id through token validation', () => {
  const net = netMock({
    users: { status: 500, json: {} },
    validate: { status: 200, json: { user_id: '99', login: 'validated_user' } },
    streams: { status: 200, json: { data: [], pagination: {} } },
  });
  const TW = loadHelix(net);
  TW.storage.remove('auth.uid');
  TW.storage.remove('auth.login');

  TW.twitch.helix.followedStreams(null, () => {}, () => {});

  const req = net.sent.find((s) => s.url.indexOf('/streams/followed') >= 0);
  assert.match(req.url, /user_id=99/);
  assert.equal(TW.auth.user().login, 'validated_user');
});

test('followedChannels validates stored tokens that do not yet have scope metadata', () => {
  const net = netMock({
    validate: { status: 200, json: { user_id: '42', login: 'me', scopes: ['user:read:follows'] } },
    channels: { status: 200, json: { data: [], pagination: {} } },
    users: { status: 200, json: { data: [] } },
  });
  const TW = loadHelix(net);
  TW.storage.remove('auth.scopes');

  TW.twitch.helix.followedChannels(null, () => {}, () => {});

  assert.ok(net.sent.find((s) => s.url.indexOf('/validate') >= 0));
  assert.ok(net.sent.find((s) => s.url.indexOf('/channels/followed') >= 0));
});

test('followedChannels fails with scope when the token lacks user:read:follows', () => {
  const net = netMock({
    validate: { status: 200, json: { user_id: '42', login: 'me', scopes: [] } },
  });
  const TW = loadHelix(net);
  TW.storage.remove('auth.scopes');
  let err = null;

  TW.twitch.helix.followedChannels(null, () => {}, (reason) => { err = reason; });

  assert.equal(err, 'scope');
  assert.equal(TW.auth.isLoggedIn(), false);
  assert.equal(net.sent.find((s) => s.url.indexOf('/channels/followed') >= 0), undefined);
});

test('followedChannels clears the session when Helix reports a missing scope', () => {
  const net = netMock({
    channels: { status: 401, json: { message: 'missing user:read:follows scope' } },
  });
  const TW = loadHelix(net);
  let err = null;

  TW.twitch.helix.followedChannels(null, () => {}, (reason) => { err = reason; });

  assert.equal(err, 'scope');
  assert.equal(TW.auth.isLoggedIn(), false);
});
