/*!
 * core/twitch/usher.js — build the usher HLS master-playlist URL.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.twitch = TW.twitch || {};

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
    return TW.config.api.usherBase + encodeURIComponent(channel) + '.m3u8?' + p.join('&');
  }

  /** Build the usher VOD master-playlist URL from a {value, signature} token. */
  function buildVodUrl(vodId, token) {
    var p = [
      'sig=' + encodeURIComponent(token.signature),
      'token=' + encodeURIComponent(token.value),
      'allow_source=true',
      'allow_audio_only=true',
      'player=twitchweb',
      'platform=web',
      'type=any',
      'p=' + Math.floor(Math.random() * 9999999),
      'supported_codecs=h264',
      'playlist_include_framerate=true'
    ];
    return TW.config.api.usherVodBase + encodeURIComponent(vodId) + '.m3u8?' + p.join('&');
  }

  TW.twitch.usher = { build: buildUsherUrl, buildVod: buildVodUrl };
})(this);
