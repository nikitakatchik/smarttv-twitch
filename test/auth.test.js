'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, mockXHR } = require('./_load');

// A scriptable TW.net replacement. routes.device / routes.token (value or
// function(opts)) / routes.revoke each return { status, json }. Records sends.
function netMock(routes) {
  const sent = [];
  const net = {
    rewrite: (u) => u,
    send: (opts, onDone) => {
      sent.push(opts);
      let r;
      if (opts.url.indexOf('/device') >= 0) { r = routes.device; }
      else if (opts.url.indexOf('/token') >= 0) { r = typeof routes.token === 'function' ? routes.token(opts) : routes.token; }
      else if (opts.url.indexOf('/validate') >= 0) { r = routes.validate; }
      else if (opts.url.indexOf('/revoke') >= 0) { r = routes.revoke || { status: 200, json: {} }; }
      else if (opts.url.indexOf('/users') >= 0) { r = routes.users || { status: 200, json: { data: [{ id: '42', login: 'me', display_name: 'Me' }] } }; }
      else if (opts.url.indexOf('/streams/followed') >= 0) { r = typeof routes.followed === 'function' ? routes.followed(opts) : routes.followed; }
      else { r = { status: 404, json: {} }; }
      onDone(r.status, JSON.stringify(r.json));
    }
  };
  net.sent = sent;
  return net;
}

function loadAuth(net, withHelix) {
  const files = ['core/polyfill.js', 'core/util.js', 'core/config.js', 'core/storage.js', 'core/net.js', 'core/twitch/auth.js'];
  if (withHelix) { files.push('core/twitch/helix.js'); }
  const g = loadCore(files, {});
  g.TW.net = net;
  g.TW.twitch = g.TW.twitch || {};
  if (!withHelix) { g.TW.twitch.helix = { me: (ok) => ok({ id: '42', login: 'me', display_name: 'Me' }) }; }
  return g.TW;
}

test('startDeviceFlow refuses without a client-id', () => {
  const TW = loadAuth(netMock({}));
  TW.config.api.userClientId = ''; // simulate a build with no baked-in default
  let err = null;
  TW.auth.startDeviceFlow(['user:read:follows'], { onError: (r) => { err = r; } });
  assert.equal(err, 'no-client-id');
});

test('startDeviceFlow posts client_id + scopes and surfaces the user code', () => {
  // expires_in -1 => already past, so the poll loop ends after we capture the code.
  const net = netMock({
    device: { status: 200, json: { device_code: 'dc', user_code: 'WXYZ-1234', verification_uri: 'https://twitch.tv/activate', expires_in: -1, interval: 0 } },
    token: { status: 400, json: { message: 'authorization_pending' } },
  });
  const TW = loadAuth(net);
  TW.config.api.userClientId = 'myid';
  let code = null;
  TW.auth.startDeviceFlow(['user:read:follows'], { onCode: (i) => { code = i; } });
  assert.equal(code.user_code, 'WXYZ-1234');
  assert.equal(code.verification_uri, 'https://twitch.tv/activate');
  const dev = net.sent[0];
  assert.match(dev.body, /client_id=myid/);
  assert.match(dev.body, /scopes=user%3Aread%3Afollows/);
});

test('a successful token exchange stores the token and identity', () => {
  const net = netMock({
    device: { status: 200, json: { device_code: 'dc', user_code: 'AAAA', verification_uri: 'u', expires_in: 1800, interval: 0 } },
    token: { status: 200, json: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: ['user:read:follows'] } },
  });
  const TW = loadAuth(net);
  TW.config.api.userClientId = 'myid';
  let ok = false;
  TW.auth.startDeviceFlow(['user:read:follows'], { onSuccess: () => { ok = true; } });
  assert.equal(ok, true);
  assert.equal(TW.auth.isLoggedIn(), true);
  assert.equal(TW.auth.token(), 'AT');
  assert.equal(TW.auth.user().id, '42');
  assert.equal(TW.auth.hasScopes(['user:read:follows']), true);
  const tokenReq = net.sent.find((s) => s.url.indexOf('/token') >= 0);
  assert.match(tokenReq.body, /scopes=user%3Aread%3Afollows/);
});

test('token validation supplies identity when Helix /users fails', () => {
  const net = netMock({
    device: { status: 200, json: { device_code: 'dc', user_code: 'AAAA', verification_uri: 'u', expires_in: 1800, interval: 0 } },
    token: { status: 200, json: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } },
    users: { status: 500, json: {} },
    validate: { status: 200, json: { user_id: '99', login: 'validated_user', scopes: ['user:read:follows'] } },
  });
  const TW = loadAuth(net, true);
  TW.config.api.userClientId = 'myid';
  let ok = null;
  TW.auth.startDeviceFlow(['user:read:follows'], { onSuccess: (u) => { ok = u; } });

  assert.equal(ok.id, '99');
  assert.equal(ok.login, 'validated_user');
  assert.equal(TW.auth.user().id, '99');
  assert.equal(TW.auth.user().login, 'validated_user');
  assert.equal(TW.auth.hasScopes(['user:read:follows']), true);
  const validateReq = net.sent.find((s) => s.url.indexOf('/validate') >= 0);
  assert.equal(validateReq.headers.Authorization, 'OAuth AT');
});

test('ensureScopes validates an old token before followed APIs use it', () => {
  const net = netMock({
    validate: { status: 200, json: { user_id: '42', login: 'me', scopes: ['user:read:follows'] } },
  });
  const TW = loadAuth(net);
  TW.storage.set('auth.access', 'AT');
  let ok = false;

  TW.auth.ensureScopes(['user:read:follows'], () => { ok = true; }, () => {});

  assert.equal(ok, true);
  assert.equal(TW.auth.hasScopes(['user:read:follows']), true);
});

test('ensureScopes fails specifically when the token lacks a required scope', () => {
  const net = netMock({
    validate: { status: 200, json: { user_id: '42', login: 'me', scopes: [] } },
  });
  const TW = loadAuth(net);
  TW.storage.set('auth.access', 'AT');
  let err = null;

  TW.auth.ensureScopes(['user:read:follows'], () => {}, (reason) => { err = reason; });

  assert.equal(err, 'scope');
  assert.equal(TW.auth.isLoggedIn(), false);
});

test('ensureScopes lets Helix try when scope metadata is absent and validation has a network failure', () => {
  const net = netMock({
    validate: { status: 0, json: {} },
  });
  const TW = loadAuth(net);
  TW.storage.set('auth.access', 'AT');
  let ok = false;

  TW.auth.ensureScopes(['user:read:follows'], () => { ok = true; }, () => {});

  assert.equal(ok, true);
  assert.equal(TW.auth.isLoggedIn(), true);
});

test('identity failure does not leave a half-logged-in account', () => {
  const net = netMock({
    device: { status: 200, json: { device_code: 'dc', user_code: 'AAAA', verification_uri: 'u', expires_in: 1800, interval: 0 } },
    token: { status: 200, json: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } },
    users: { status: 500, json: {} },
    validate: { status: 401, json: {} },
  });
  const TW = loadAuth(net, true);
  TW.config.api.userClientId = 'myid';
  let err = null;
  TW.auth.startDeviceFlow(['user:read:follows'], { onError: (r) => { err = r; } });

  assert.equal(err, 'identity');
  assert.equal(TW.auth.isLoggedIn(), false);
  assert.equal(TW.auth.user(), null);
});

test('polling continues through authorization_pending until it succeeds', async () => {
  let n = 0;
  const net = netMock({
    device: { status: 200, json: { device_code: 'dc', user_code: 'BBBB', verification_uri: 'u', expires_in: 1800, interval: 0 } },
    token: () => { n++; return n < 3 ? { status: 400, json: { message: 'authorization_pending' } } : { status: 200, json: { access_token: 'AT2' } }; },
  });
  const TW = loadAuth(net);
  TW.config.api.userClientId = 'myid';
  await new Promise((resolve) => { TW.auth.startDeviceFlow(['s'], { onSuccess: resolve, onError: resolve }); });
  assert.equal(TW.auth.token(), 'AT2');
  assert.ok(n >= 3);
});

test('logout clears the stored session', () => {
  const net = netMock({
    device: { status: 200, json: { device_code: 'dc', user_code: 'C', verification_uri: 'u', expires_in: 1800, interval: 0 } },
    token: { status: 200, json: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } },
  });
  const TW = loadAuth(net);
  TW.config.api.userClientId = 'myid';
  TW.auth.startDeviceFlow(['s'], {});
  assert.equal(TW.auth.isLoggedIn(), true);
  let done = false;
  TW.auth.logout(() => { done = true; });
  assert.equal(done, true);
  assert.equal(TW.auth.isLoggedIn(), false);
  assert.equal(TW.auth.user(), null);
});

test('helix.followedStreams maps the Helix shape and sizes the thumbnail', () => {
  const net = netMock({
    followed: { status: 200, json: {
      data: [{
        user_login: 'a', user_name: 'A', title: 't', viewer_count: 5,
        game_id: '99', game_name: 'G', thumbnail_url: 'http://x/{width}x{height}.jpg',
      }],
      pagination: { cursor: 'cur' },
    } },
  });
  const TW = loadAuth(net, true);
  // Stand in for a logged-in user so helix skips the /users lookup.
  TW.storage.set('auth.access', 'AT'); TW.storage.set('auth.uid', '42');
  TW.storage.set('auth.scopes', 'user:read:follows');
  TW.config.api.userClientId = 'CID';
  let res = null;
  TW.twitch.helix.followedStreams(null, (r) => { res = r; }, () => {});
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].kind, 'stream');
  assert.equal(res.items[0].login, 'a');
  assert.equal(res.items[0].viewers, 5);
  assert.equal(res.items[0].gameId, '99');
  assert.equal(res.items[0].game, 'G');
  assert.match(res.items[0].gameBox, /ttv-boxart\/G-285x380\.jpg/);
  assert.match(res.items[0].thumb, /320x180/);
  assert.equal(res.cursor, 'cur');
});

test('GraphQL never attaches the OAuth token — browse stays anonymous even when logged in', () => {
  // A user token is minted by the device-flow client; gql.twitch.tv authorizes
  // only the public web Client-ID, so attaching it 401s the whole request and
  // breaks browse for logged-in users. Browse must always be anonymous.
  function gqlHeaders(loggedIn) {
    const XHR = mockXHR(() => ({ status: 200, text: JSON.stringify({ data: { streams: { edges: [] } } }) }));
    const g = loadCore([
      'core/polyfill.js', 'core/util.js', 'core/config.js', 'core/storage.js', 'core/http.js',
      'core/twitch/usher.js', 'core/twitch/playlist.js', 'core/twitch/auth.js', 'core/twitch/gql.js', 'core/twitch/api.js',
    ], { XMLHttpRequest: XHR });
    if (loggedIn) { g.TW.storage.set('auth.access', 'USERTOKEN'); }
    g.TW.api.topStreams(null, () => {}, () => {});
    return XHR.log[XHR.log.length - 1].headers;
  }
  assert.equal(gqlHeaders(false).Authorization, undefined);
  assert.equal(gqlHeaders(true).Authorization, undefined);
});
