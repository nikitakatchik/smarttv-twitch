/*!
 * core/twitch/usher.js — build the usher HLS URL + the optional relay wrapper.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.twitch = TW.twitch || {};

  /**
   * If config.api.relayBase is set, route any Twitch target through it:
   *   <relayBase>/relay?url=<encoded target>
   * This is how a 2011 TV (no SNI) and the in-browser harness reach Twitch
   * despite TLS / CORS limits. With no relay configured, returns url unchanged.
   */
  function relayUrl(url) {
    var base = TW.config.api.relayBase;
    if (!base) { return url; }
    return base.replace(/\/$/, '') + '/relay?url=' + encodeURIComponent(url);
  }

  /**
   * Build the usher master-playlist URL from a {value, signature} access token.
   * Param set mirrors the current Twitch web player (verified 2026).
   */
  function buildUsherUrl(channel, token) {
    var p = [
      'sig=' + encodeURIComponent(token.signature),
      'token=' + encodeURIComponent(token.value),
      'allow_source=true',
      'allow_audio_only=true',
      'fast_bread=true',
      'player=twitchweb',
      'platform=web',
      'type=any',
      'p=' + Math.floor(Math.random() * 9999999),
      'supported_codecs=h264',
      'playlist_include_framerate=true'
    ];
    var url = TW.config.api.usherBase + encodeURIComponent(channel) + '.m3u8?' + p.join('&');
    return relayUrl(url);
  }

  TW.twitch.usher = { build: buildUsherUrl };
  TW.twitch.relayUrl = relayUrl;
})(this);
