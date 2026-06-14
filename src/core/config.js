/*!
 * core/config.js — runtime configuration.
 *
 * Talks to Twitch's public GraphQL directly (the Streamlink/yt-dlp approach):
 * no secrets, no backend, no server. Every supported target — Tizen and
 * 2013–2014 Orsay — reaches Twitch directly.
 *
 * A platform boot file may override any of these before TW.app.start().
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  TW.config = {
    // The app's own product name. It is an unofficial viewer FOR Twitch, not
    // affiliated with Twitch/Amazon — so it carries its own name and never the
    // Twitch logo or brand. Change this one value to rebrand.
    appName: 'Twellie',

    api: {
      // Public Twitch web Client-ID (same one the website and Streamlink use).
      clientId: 'kimne78kx3ncx6brgo4mv6wki5h1ko',
      gqlUrl: 'https://gql.twitch.tv/gql',
      usherBase: 'https://usher.ttvnw.net/api/channel/hls/',
      usherVodBase: 'https://usher.ttvnw.net/vod/'
    },

    // Grid layout. Twitch GraphQL caps connection `first` at 30 (infinite
    // scroll fetches more on demand).
    columns: 4,
    pageSize: 30,

    // Default + remembered quality label ('Auto', 'chunked'/source, '720p60'…).
    defaultQuality: 'High',

    // UI language; see lang/. Falls back to 'en'.
    language: 'en',

    // Logical screen the layout is authored against. Orsay panels are 1280x720
    // or 960x540; Tizen authors against 1920x1080; CSS scales to fit.
    screen: { width: 1280, height: 720 }
  };
})(this);
