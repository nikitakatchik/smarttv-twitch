/*!
 * core/twitch/api.js — the one API surface the app talks to.
 *
 * Picks the configured backend (public GraphQL or Helix-via-proxy) for browse
 * data, and owns the playback handshake (access token -> usher master URL).
 * Quality/variant handling is intentionally left to each platform's player
 * adapter, because hls.js, Tizen AVPlay and Orsay INFOLINK each discover
 * renditions differently; fetchVariants() is provided for adapters (Orsay)
 * that parse the master playlist themselves.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.twitch = TW.twitch || {};

  function backend() {
    return TW.config.api.backend === 'proxy' ? TW.twitch.helix : TW.twitch.gql;
  }

  var api = {
    backendName: function () { return backend().name; },

    topStreams: function (cursor, onOk, onFail) {
      backend().topStreams(TW.config.pageSize, cursor, onOk, onFail);
    },
    topGames: function (cursor, onOk, onFail) {
      backend().topGames(TW.config.pageSize, cursor, onOk, onFail);
    },
    streamsByGame: function (game, cursor, onOk, onFail) {
      backend().streamsByGame(game, TW.config.pageSize, cursor, onOk, onFail);
    },
    streamInfo: function (login, onOk, onFail) {
      backend().streamInfo(login, onOk, onFail);
    },

    /**
     * Resolve a channel to a playable usher master-playlist URL.
     * The playback token always comes from GraphQL (Helix can't mint one);
     * the backend's playbackToken() handles that delegation.
     */
    playbackUrl: function (channel, onOk, onFail) {
      backend().playbackToken(channel, function (token) {
        onOk(TW.twitch.usher.build(channel, token));
      }, onFail);
    },

    /**
     * Fetch + parse the master playlist into renditions. Used by player
     * adapters that select quality by swapping variant URLs (Orsay). onOk
     * receives an array of { name, url, bandwidth, resolution, frameRate }.
     */
    fetchVariants: function (masterUrl, onOk, onFail) {
      TW.http.request({ method: 'GET', url: masterUrl, retries: 3 },
        function (text) { onOk(TW.twitch.playlist.parseMaster(text)); },
        function (status) { if (onFail) { onFail(status); } });
    }
  };

  TW.api = api;
})(this);
