/*!
 * core/twitch/auth.js — Twitch login via the OAuth Device Code Grant.
 *
 * A TV has no browser to bounce an OAuth redirect through, so we use the device
 * flow: the app shows a short code, the user approves it at twitch.tv/activate
 * on a phone, and we poll for the token. This is a PUBLIC client — no secret,
 * no backend. The user registers their own free Twitch application once and
 * gives us its Client-ID (see docs/LOGIN.md); the token it mints drives Helix
 * (followed channels) and is also offered to GraphQL for sub-only playback.
 *
 * Tokens + identity are persisted via TW.storage; all requests go through
 * TW.net (direct on TVs, dev-proxied in the harness).
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  var DEVICE_URL = 'https://id.twitch.tv/oauth2/device';
  var TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  var REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';
  var GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

  function nowMs() { return (Date.now ? Date.now() : new Date().getTime()); }

  function form(params) {
    var pairs = [];
    for (var k in params) {
      if (params.hasOwnProperty(k)) { pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); }
    }
    return pairs.join('&');
  }

  function postForm(url, params, onDone) {
    TW.net.send({
      method: 'POST', url: url,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form(params)
    }, function (status, text) {
      var json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) {}
      onDone(status, json);
    });
  }

  function clientId() {
    return TW.storage.get('clientId') || (TW.config.api && TW.config.api.userClientId) || '';
  }

  function token() { return TW.storage.get('auth.access'); }
  function isLoggedIn() { return !!token(); }

  function user() {
    var id = TW.storage.get('auth.uid');
    if (!id) { return null; }
    return { id: id, login: TW.storage.get('auth.login') || '', display: TW.storage.get('auth.name') || '' };
  }

  function setIdentity(u) {
    if (!u) { return; }
    TW.storage.set('auth.uid', u.id);
    TW.storage.set('auth.login', u.login || '');
    TW.storage.set('auth.name', u.display_name || u.display || u.login || '');
  }

  function storeTokens(json) {
    TW.storage.set('auth.access', json.access_token);
    if (json.refresh_token) { TW.storage.set('auth.refresh', json.refresh_token); }
    TW.storage.set('auth.exp', String(nowMs() + ((json.expires_in || 0) * 1000)));
  }

  function clearTokens() {
    TW.storage.remove('auth.access'); TW.storage.remove('auth.refresh'); TW.storage.remove('auth.exp');
    TW.storage.remove('auth.uid'); TW.storage.remove('auth.login'); TW.storage.remove('auth.name');
  }

  // Start the device flow. callbacks: onCode(info), onSuccess(user), onError(reason).
  function startDeviceFlow(scopes, cb) {
    cb = cb || {};
    var id = clientId();
    if (!id) { if (cb.onError) { cb.onError('no-client-id'); } return; }
    var scopeStr = (scopes || []).join(' ');

    postForm(DEVICE_URL, { client_id: id, scopes: scopeStr }, function (status, json) {
      if (status !== 200 || !json || !json.device_code) {
        if (cb.onError) { cb.onError('device-request-failed'); }
        return;
      }
      if (cb.onCode) {
        cb.onCode({
          user_code: json.user_code,
          verification_uri: json.verification_uri || 'https://www.twitch.tv/activate',
          expires_in: json.expires_in, interval: json.interval
        });
      }
      var interval = (json.interval || 5) * 1000;
      var deadline = nowMs() + ((json.expires_in || 1800) * 1000);
      poll(id, json.device_code, interval, deadline, cb);
    });
  }

  function poll(id, deviceCode, interval, deadline, cb) {
    if (nowMs() > deadline) { if (cb.onError) { cb.onError('expired'); } return; }
    postForm(TOKEN_URL, { client_id: id, device_code: deviceCode, grant_type: GRANT }, function (status, json) {
      if (status === 200 && json && json.access_token) {
        storeTokens(json);
        // Resolve who we are (Helix /users) before declaring success.
        TW.twitch.helix.me(function (u) {
          if (u) { setIdentity(u); }
          if (cb.onSuccess) { cb.onSuccess(u); }
        }, function () { if (cb.onSuccess) { cb.onSuccess(null); } });
        return;
      }
      var msg = (json && (json.message || json.error)) || '';
      if (/slow_down/i.test(msg)) { interval += 5000; }
      if (status === 0) { if (cb.onError) { cb.onError('network'); } return; }
      if (/expired/i.test(msg)) { if (cb.onError) { cb.onError('expired'); } return; }
      if (/denied/i.test(msg)) { if (cb.onError) { cb.onError('denied'); } return; }
      // Still pending (Twitch returns 400 authorization_pending) — keep polling.
      TW.delay(interval, function () { poll(id, deviceCode, interval, deadline, cb); });
    });
  }

  // Exchange the refresh token for a fresh access token. cb(ok).
  function refresh(cb) {
    var rt = TW.storage.get('auth.refresh'); var id = clientId();
    if (!rt || !id) { if (cb) { cb(false); } return; }
    postForm(TOKEN_URL, { client_id: id, grant_type: 'refresh_token', refresh_token: rt }, function (status, json) {
      if (status === 200 && json && json.access_token) { storeTokens(json); if (cb) { cb(true); } }
      else { if (cb) { cb(false); } }
    });
  }

  function logout(cb) {
    var t = token(); var id = clientId();
    clearTokens();
    if (t && id) { postForm(REVOKE_URL, { client_id: id, token: t }, function () { if (cb) { cb(); } }); }
    else if (cb) { cb(); }
  }

  TW.auth = {
    clientId: clientId,
    setClientId: function (id) { TW.storage.set('clientId', String(id || '').replace(/^\s+|\s+$/g, '')); },
    token: token,
    isLoggedIn: isLoggedIn,
    user: user,
    setIdentity: setIdentity,
    startDeviceFlow: startDeviceFlow,
    refresh: refresh,
    logout: logout,
    SCOPES: ['user:read:follows']
  };
})(this);
