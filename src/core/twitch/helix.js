/*!
 * core/twitch/helix.js — Twitch Helix, client-side, with the USER's own token.
 *
 * This is NOT the serverless token-broker that an earlier revision deleted —
 * there is no backend and no secret. Once the user logs in (see auth.js) we hold
 * a user access token minted by THEIR registered Twitch app, and Helix is the
 * documented API for "what is this user following": GET /streams/followed needs
 * a user token whose client-id matches the Client-Id header, which is exactly
 * what device-flow gives us. Browse/playback stay on GraphQL; Helix is only for
 * the logged-in surface.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.twitch = TW.twitch || {};

  var BASE = 'https://api.twitch.tv/helix';

  function headers() {
    return { 'Authorization': 'Bearer ' + TW.auth.token(), 'Client-Id': TW.auth.clientId() };
  }

  function get(path, onOk, onFail, retried) {
    if (!TW.auth.isLoggedIn()) { if (onFail) { onFail(-1); } return; }
    TW.net.send({ method: 'GET', url: BASE + path, headers: headers() }, function (status, text) {
      if (status === 401 && !retried && TW.auth.refresh) {
        TW.auth.refresh(function (ok) {
          if (ok) { get(path, onOk, onFail, true); } else if (onFail) { onFail(401); }
        });
        return;
      }
      if (status < 200 || status >= 300) { if (onFail) { onFail(status); } return; }
      var json = null;
      try { json = JSON.parse(text); } catch (e) {}
      if (!json) { if (onFail) { onFail(-1); } return; }
      onOk(json);
    });
  }

  function me(onOk, onFail) {
    get('/users', function (j) { onOk(j.data && j.data[0]); }, onFail);
  }

  function thumb(url) {
    return String(url || '').replace('{width}', '320').replace('{height}', '180');
  }

  function mapStreams(j) {
    var items = [], data = j.data || [];
    for (var i = 0; i < data.length; i++) {
      var s = data[i];
      items.push({
        kind: 'stream',
        login: s.user_login,
        display: s.user_name || s.user_login,
        title: s.title || '',
        viewers: s.viewer_count || 0,
        game: s.game_name || '',
        thumb: thumb(s.thumbnail_url)
      });
    }
    return { items: items, cursor: (j.pagination && j.pagination.cursor) || null };
  }

  // The channels the logged-in user follows that are live now.
  function followedStreams(cursor, onOk, onFail) {
    function run(uid) {
      var path = '/streams/followed?user_id=' + encodeURIComponent(uid) + '&first=30' +
        (cursor ? ('&after=' + encodeURIComponent(cursor)) : '');
      get(path, function (j) { onOk(mapStreams(j)); }, onFail);
    }
    withUserId(run, onFail);
  }

  // Batch-resolve user profiles (up to 100 ids per call) into a login->avatar
  // map. Best-effort: a failure yields an empty map rather than aborting, so the
  // channel tiles just fall back to a placeholder.
  function avatarMap(ids, done) {
    if (!ids.length) { done({}); return; }
    var qs = '';
    for (var i = 0; i < ids.length; i++) { qs += (i ? '&' : '?') + 'id=' + encodeURIComponent(ids[i]); }
    get('/users' + qs, function (j) {
      var map = {}, data = (j && j.data) || [];
      for (var k = 0; k < data.length; k++) { map[data[k].login] = data[k].profile_image_url || ''; }
      done(map);
    }, function () { done({}); });
  }

  // Every channel the user follows (live or not), newest-followed first. Twitch
  // returns login/name but no avatar here, so a second /users call fills those
  // in. The caller subtracts the live set to get the "offline" channels.
  function followedChannels(cursor, onOk, onFail) {
    function run(uid) {
      var path = '/channels/followed?user_id=' + encodeURIComponent(uid) + '&first=100' +
        (cursor ? ('&after=' + encodeURIComponent(cursor)) : '');
      get(path, function (j) {
        var data = (j && j.data) || [], items = [], ids = [];
        for (var i = 0; i < data.length; i++) {
          var c = data[i];
          items.push({
            kind: 'channel',
            login: c.broadcaster_login,
            display: c.broadcaster_name || c.broadcaster_login,
            avatar: ''
          });
          if (c.broadcaster_id) { ids.push(c.broadcaster_id); }
        }
        avatarMap(ids, function (map) {
          for (var n = 0; n < items.length; n++) { items[n].avatar = map[items[n].login] || ''; }
          onOk({ items: items, cursor: (j.pagination && j.pagination.cursor) || null });
        });
      }, onFail);
    }
    withUserId(run, onFail);
  }

  // Resolve our own user id (cached on the identity), then call run(uid).
  function withUserId(run, onFail) {
    var u = TW.auth.user();
    if (u && u.id) { run(u.id); return; }
    me(function (m) {
      if (m && m.id) { TW.auth.setIdentity(m); run(m.id); } else if (onFail) { onFail(-1); }
    }, onFail);
  }

  TW.twitch.helix = {
    me: me, followedStreams: followedStreams, followedChannels: followedChannels, mapStreams: mapStreams
  };
})(this);
