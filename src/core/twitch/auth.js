/*!
 * core/twitch/auth.js — Twitch login via the OAuth Device Code Grant.
 *
 * A TV has no browser to bounce an OAuth redirect through, so we use the device
 * flow: the app shows a short code, the user approves it at twitch.tv/activate
 * on a phone, and we poll for the token. This is a PUBLIC client — no secret,
 * no backend. The Client-ID is the app's own registered Twitch application
 * (config.api.userClientId; see docs/LOGIN.md), the same for every user. The
 * token it mints drives Helix (followed channels) only — it is NOT sent to
 * GraphQL, whose public web client rejects a token minted by a different app.
 *
 * Tokens + identity are persisted via TW.storage; all requests go through
 * TW.net (direct on TVs, dev-proxied in the harness).
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  var DEVICE_URL = 'https://id.twitch.tv/oauth2/device';
  var TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  var VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
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
    // The app's registered Twitch client, set in config (or overridden at boot
    // by the harness ?clientId= param). There is no per-user/runtime override.
    return (TW.config.api && TW.config.api.userClientId) || '';
  }

  function token() { return TW.storage.get('auth.access'); }
  function isLoggedIn() { return !!token(); }

  function normalizeScopes(scopes) {
    if (!scopes) { return []; }
    if (Object.prototype.toString.call(scopes) === '[object Array]') { return scopes; }
    return String(scopes).split(/\s+/);
  }

  function storeScopes(scopes) {
    var list = normalizeScopes(scopes);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i]) { out.push(list[i]); }
    }
    TW.storage.set('auth.scopes', out.join(' '));
  }

  function hasScopes(required) {
    var have = {}, list = normalizeScopes(TW.storage.get('auth.scopes'));
    for (var i = 0; i < list.length; i++) { have[list[i]] = true; }
    for (var j = 0; j < required.length; j++) {
      if (!have[required[j]]) { return false; }
    }
    return true;
  }

  function user() {
    var id = TW.storage.get('auth.uid');
    if (!id) { return null; }
    return { id: id, login: TW.storage.get('auth.login') || '', display: TW.storage.get('auth.name') || '' };
  }

  function setIdentity(u) {
    if (!u) { return; }
    var id = u.id || u.user_id;
    if (!id) { return; }
    var login = u.login || u.user_login || '';
    if (u.scope || u.scopes) { storeScopes(u.scope || u.scopes); }
    TW.storage.set('auth.uid', id);
    TW.storage.set('auth.login', login);
    TW.storage.set('auth.name', u.display_name || u.display || login);
  }

  function storeTokens(json) {
    TW.storage.set('auth.access', json.access_token);
    if (json.refresh_token) { TW.storage.set('auth.refresh', json.refresh_token); }
    TW.storage.set('auth.exp', String(nowMs() + ((json.expires_in || 0) * 1000)));
    if (json.scope || json.scopes) { storeScopes(json.scope || json.scopes); }
  }

  function clearTokens() {
    TW.storage.remove('auth.access'); TW.storage.remove('auth.refresh'); TW.storage.remove('auth.exp');
    TW.storage.remove('auth.uid'); TW.storage.remove('auth.login'); TW.storage.remove('auth.name');
    TW.storage.remove('auth.scopes');
  }

  function validateToken(onOk, onFail) {
    if (!token()) { if (onFail) { onFail(-1); } return; }
    TW.net.send({
      method: 'GET',
      url: VALIDATE_URL,
      headers: { 'Authorization': 'OAuth ' + token() }
    }, function (status, text) {
      var json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) {}
      if (status >= 200 && status < 300 && json && json.user_id) {
        if (json.scope || json.scopes) { storeScopes(json.scope || json.scopes); }
        onOk(json);
      }
      else if (onFail) { onFail(status == null ? -1 : status); }
    });
  }

  function ensureScopes(required, onOk, onFail) {
    if (!isLoggedIn()) { if (onFail) { onFail(-1); } return; }
    if (hasScopes(required)) { onOk(); return; }
    var hadScopeMetadata = !!TW.storage.get('auth.scopes');
    validateToken(function () {
      if (hasScopes(required)) { onOk(); }
      else {
        clearTokens();
        if (onFail) { onFail('scope'); }
      }
    }, function (status) {
      if (status === 0 && !hadScopeMetadata) { onOk(); }
      else if (onFail) { onFail(status); }
    });
  }

  function resolveIdentity(onOk, onFail) {
    var cached = user();
    if (cached && cached.id && cached.login) { onOk(cached); return; }

    function done(u) {
      if (u && (u.id || u.user_id)) {
        setIdentity(u);
        onOk(user() || u);
      } else if (onFail) {
        onFail(-1);
      }
    }

    if (TW.twitch && TW.twitch.helix && TW.twitch.helix.me) {
      TW.twitch.helix.me(done, function () { validateToken(done, onFail); });
    } else {
      validateToken(done, onFail);
    }
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
      poll(id, json.device_code, scopeStr, interval, deadline, cb);
    });
  }

  function poll(id, deviceCode, scopeStr, interval, deadline, cb) {
    if (nowMs() > deadline) { if (cb.onError) { cb.onError('expired'); } return; }
    postForm(TOKEN_URL, { client_id: id, scopes: scopeStr, device_code: deviceCode, grant_type: GRANT }, function (status, json) {
      if (status === 200 && json && json.access_token) {
        storeTokens(json);
        // Resolve who we are before declaring success. Some legacy Orsay builds
        // can complete the token exchange but fail Helix /users; token validate
        // still gives us user_id/login from id.twitch.tv.
        resolveIdentity(function (u) {
          if (cb.onSuccess) { cb.onSuccess(u); }
        }, function () {
          clearTokens();
          if (cb.onError) { cb.onError('identity'); }
        });
        return;
      }
      var msg = (json && (json.message || json.error)) || '';
      if (/slow_down/i.test(msg)) { interval += 5000; }
      if (status === 0) { if (cb.onError) { cb.onError('network'); } return; }
      if (/expired/i.test(msg)) { if (cb.onError) { cb.onError('expired'); } return; }
      if (/denied/i.test(msg)) { if (cb.onError) { cb.onError('denied'); } return; }
      // Only an explicit pending/slow_down state will resolve by polling. Any
      // other response (5xx, 429, an unexpected 4xx) won't — fail fast instead of
      // polling on to the code's ~30-min deadline behind a frozen screen.
      if (!/authorization_pending|slow_down/i.test(msg)) { if (cb.onError) { cb.onError('failed'); } return; }
      // Still pending (Twitch returns 400 authorization_pending) — keep polling.
      TW.delay(interval, function () { poll(id, deviceCode, scopeStr, interval, deadline, cb); });
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
    token: token,
    isLoggedIn: isLoggedIn,
    user: user,
    setIdentity: setIdentity,
    hasScopes: hasScopes,
    ensureScopes: ensureScopes,
    clear: clearTokens,
    resolveIdentity: resolveIdentity,
    startDeviceFlow: startDeviceFlow,
    refresh: refresh,
    logout: logout,
    SCOPES: ['user:read:follows']
  };
})(this);
