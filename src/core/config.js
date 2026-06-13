/*!
 * core/config.js — runtime configuration.
 *
 * Defaults are tuned for the zero-backend "public GraphQL" mode (the
 * Streamlink/yt-dlp approach), which needs no secrets and no server. Switch
 * `api.backend` to 'proxy' and set `api.proxyBase` to your deployed worker
 * (see proxy/) for the official, ToS-compliant Helix path — and, for the
 * oldest Orsay TVs, to bridge modern TLS/SNI that the panels can't negotiate.
 *
 * A platform boot file may override any of these before TW.app.start().
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  TW.config = {
    api: {
      // 'gql'   — talk to Twitch's public GraphQL directly (no backend).
      // 'proxy' — talk to your own serverless relay (Helix + TLS/CORS bridge).
      backend: 'gql',

      // Public Twitch web Client-ID (same one the website and Streamlink use).
      // Only used in 'gql' mode; in 'proxy' mode the worker holds the real id.
      clientId: 'kimne78kx3ncx6brgo4mv6wki5h1ko',

      gqlUrl: 'https://gql.twitch.tv/gql',
      usherBase: 'https://usher.ttvnw.net/api/channel/hls/',

      // Base URL of your deployed proxy/relay, e.g.
      // 'https://twitch-proxy.example.workers.dev'. Required for 'proxy' mode.
      proxyBase: '',

      // If set, every Twitch request (gql, usher, playlist, segments) is routed
      // through `relayBase + '/relay?url=' + encodeURIComponent(target)`. This
      // is what lets a 2011 TV (no SNI, TLS 1.2 max) and the in-browser harness
      // reach Twitch despite TLS / CORS limits. Leave '' to talk to Twitch
      // directly (correct for Tizen and most 2013–2014 panels).
      relayBase: ''
    },

    // Grid layout.
    columns: 4,
    pageSize: 100,

    // Default + remembered quality label ('Auto', 'chunked'/source, '720p60'…).
    defaultQuality: 'High',

    // UI language; see lang/. Falls back to 'en'.
    language: 'en',

    // Logical screen the layout is authored against. Orsay panels are 1280x720
    // or 960x540; Tizen authors against 1920x1080; CSS scales to fit.
    screen: { width: 1280, height: 720 }
  };
})(this);
