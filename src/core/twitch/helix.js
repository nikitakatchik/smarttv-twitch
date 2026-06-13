/*!
 * core/twitch/helix.js — official Helix backend, via your serverless proxy.
 *
 * Helix requires a Client-Id + OAuth Bearer on every call and sends no CORS,
 * so the client never talks to api.twitch.tv directly: it calls
 *   <proxyBase>/helix/...
 * and the worker (see proxy/) injects the credentials and CORS headers.
 *
 * Helix has no playback-token endpoint — that lives only in GraphQL — so
 * playbackToken() delegates to the GraphQL backend (routed through the relay
 * when configured). Everything else is cursor-paginated like GraphQL.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.twitch = TW.twitch || {};

  function helixUrl(path, params) {
    var base = TW.config.api.proxyBase.replace(/\/$/, '');
    var qs = [];
    for (var k in params) {
      if (params.hasOwnProperty(k) && params[k] != null && params[k] !== '') {
        qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    }
    return base + path + (qs.length ? ('?' + qs.join('&')) : '');
  }

  function sized(url, w, h) {
    return TW.twitch.relayUrl(
      String(url || '').replace('{width}', w).replace('{height}', h));
  }

  function get(path, params, onData, onFail) {
    TW.http.getJson(helixUrl(path, params), null, onData, onFail);
  }

  function mapStreams(json) {
    var items = [], data = (json && json.data) || [];
    for (var i = 0; i < data.length; i++) {
      var s = data[i];
      items.push({
        kind: 'stream', login: s.user_login, display: s.user_name || s.user_login,
        title: s.title || '', viewers: s.viewer_count || 0, game: s.game_name || '',
        thumb: sized(s.thumbnail_url, 320, 180)
      });
    }
    return { items: items, cursor: (json.pagination && json.pagination.cursor) || null };
  }

  var backend = {
    name: 'helix',

    topStreams: function (limit, cursor, onOk, onFail) {
      get('/helix/streams', { first: limit, after: cursor },
        function (j) { onOk(mapStreams(j)); }, onFail);
    },

    topGames: function (limit, cursor, onOk, onFail) {
      get('/helix/games/top', { first: limit, after: cursor }, function (j) {
        var items = [], data = (j && j.data) || [];
        for (var i = 0; i < data.length; i++) {
          items.push({
            kind: 'game', id: data[i].id, name: data[i].name,
            display: data[i].name, viewers: 0, box: sized(data[i].box_art_url, 285, 380)
          });
        }
        onOk({ items: items, cursor: (j.pagination && j.pagination.cursor) || null });
      }, onFail);
    },

    streamsByGame: function (game, limit, cursor, onOk, onFail) {
      get('/helix/streams', { game_id: game.id, first: limit, after: cursor },
        function (j) { onOk(mapStreams(j)); }, onFail);
    },

    streamInfo: function (login, onOk, onFail) {
      get('/helix/streams', { user_login: login }, function (j) {
        var s = (j.data && j.data[0]) || null;
        onOk({
          display: s ? (s.user_name || login) : login,
          logo: '',
          title: s ? s.title : '',
          viewers: s ? s.viewer_count : 0,
          online: !!s
        });
      }, onFail);
    },

    // Delegate to GraphQL — Helix cannot mint a playback token.
    playbackToken: function (channel, onOk, onFail) {
      TW.twitch.gql.playbackToken(channel, onOk, onFail);
    }
  };

  TW.twitch.helix = backend;
})(this);
