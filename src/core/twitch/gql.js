/*!
 * core/twitch/gql.js — Twitch public GraphQL backend (zero-backend mode).
 *
 * This is the Streamlink / yt-dlp approach: POST to gql.twitch.tv with the
 * public web Client-ID, no user login, no secret. Verified working 2026-06-13.
 *
 * Design choice: the browse queries request ONLY fields confirmed live, and
 * image URLs are CONSTRUCTED from login / game name (static-cdn) rather than
 * asked for over GraphQL. A single unknown field makes GraphQL reject the whole
 * query, so keeping the fatal browse path to verified fields is intentional.
 * The raw-query form (no persisted sha256 hash) is used everywhere because
 * Twitch rotates the persisted hashes without notice (last break: 2025-11-11).
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.twitch = TW.twitch || {};

  function thumbUrl(login) {
    return TW.twitch.relayUrl(
      'https://static-cdn.jtvnw.net/previews-ttv/live_user_' + login + '-320x180.jpg');
  }
  function boxUrl(name) {
    return TW.twitch.relayUrl(
      'https://static-cdn.jtvnw.net/ttv-boxart/' + encodeURIComponent(name) + '-285x380.jpg');
  }

  function post(query, onData, onFail) {
    var headers = { 'Client-ID': TW.config.api.clientId };
    TW.http.postJson(TW.twitch.relayUrl(TW.config.api.gqlUrl), headers, { query: query },
      function (json) {
        if (json && json.data) { onData(json.data); }
        else if (onFail) { onFail(-1, null, json && json.errors); }
      }, onFail);
  }

  function afterClause(cursor) {
    return cursor ? (', after: "' + cursor + '"') : '';
  }

  function mapStreamEdges(conn) {
    var items = [];
    var edges = (conn && conn.edges) || [];
    var lastCursor = null;
    for (var i = 0; i < edges.length; i++) {
      var node = edges[i].node;
      if (!node || !node.broadcaster) { continue; }
      lastCursor = edges[i].cursor || lastCursor;
      items.push({
        kind: 'stream',
        login: node.broadcaster.login,
        display: node.broadcaster.displayName || node.broadcaster.login,
        title: node.title || '',
        viewers: node.viewersCount || 0,
        game: (node.game && node.game.name) || '',
        thumb: thumbUrl(node.broadcaster.login)
      });
    }
    return { items: items, cursor: lastCursor };
  }

  var backend = {
    name: 'gql',

    topStreams: function (limit, cursor, onOk, onFail) {
      post('{ streams(first: ' + limit + afterClause(cursor) + ') { edges { cursor node { ' +
        'id title viewersCount broadcaster { login displayName } game { name } } } } }',
        function (data) { onOk(mapStreamEdges(data.streams)); }, onFail);
    },

    topGames: function (limit, cursor, onOk, onFail) {
      post('{ games(first: ' + limit + afterClause(cursor) + ') { edges { cursor node { ' +
        'id name displayName viewersCount } } } }',
        function (data) {
          var items = [], edges = (data.games && data.games.edges) || [], last = null;
          for (var i = 0; i < edges.length; i++) {
            var n = edges[i].node; if (!n) { continue; }
            last = edges[i].cursor || last;
            items.push({
              kind: 'game', id: n.id, name: n.name,
              display: n.displayName || n.name, viewers: n.viewersCount || 0,
              box: boxUrl(n.name)
            });
          }
          onOk({ items: items, cursor: last });
        }, onFail);
    },

    streamsByGame: function (game, limit, cursor, onOk, onFail) {
      var q = '{ game(name: "' + String(game.name).replace(/"/g, '\\"') + '") { streams(first: ' +
        limit + afterClause(cursor) + ') { edges { cursor node { ' +
        'id title viewersCount broadcaster { login displayName } game { name } } } } } }';
      post(q, function (data) {
        onOk(mapStreamEdges(data.game && data.game.streams));
      }, onFail);
    },

    // Non-fatal: only powers the player overlay. Uses a couple of standard but
    // not-live-verified fields; failure just leaves the overlay blank.
    streamInfo: function (login, onOk, onFail) {
      var q = '{ user(login: "' + login.replace(/"/g, '\\"') + '") { displayName ' +
        'profileImageURL(width: 150) stream { title viewersCount } } }';
      post(q, function (data) {
        var u = data.user || {};
        onOk({
          display: u.displayName || login,
          logo: u.profileImageURL ? TW.twitch.relayUrl(u.profileImageURL) : '',
          title: (u.stream && u.stream.title) || '',
          viewers: (u.stream && u.stream.viewersCount) || 0,
          online: !!u.stream
        });
      }, onFail);
    },

    // Live HLS access token (value + signature) — no user OAuth.
    playbackToken: function (channel, onOk, onFail) {
      var q = '{ streamPlaybackAccessToken(channelName: "' + channel.replace(/"/g, '\\"') +
        '", params: { platform: "web", playerBackend: "mediaplayer", playerType: "site" }) ' +
        '{ value signature } }';
      post(q, function (data) {
        var t = data.streamPlaybackAccessToken;
        if (t && t.value) { onOk({ value: t.value, signature: t.signature }); }
        else if (onFail) { onFail(-1); }
      }, onFail);
    }
  };

  TW.twitch.gql = backend;
})(this);
