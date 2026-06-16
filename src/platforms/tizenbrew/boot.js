/*!
 * platforms/tizenbrew/boot.js — wire the TizenBrew adapter and start the app.
 *
 * Runs as a plain page inside TizenBrew's webview. Like the real TV builds it
 * leaves TW.net.rewrite as the identity (Twitch's gql/api hosts send permissive
 * CORS, so browse + auth go direct — no dev proxy). Playback is HTML5 <video> +
 * hls.js (see platform/player.js). The UI is authored on a 1280x720 stage and
 * scaled 1.5x to the panel in index.html.
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  function start() {
    TW.app.start({
      name: 'tizenbrew',
      config: {
        screen: { width: 1280, height: 720 }
      },
      keys: TW.platform.keys,
      createPlayer: TW.platform.createPlayer,
      system: TW.platform.system,
      log: function (m) { if (global.console) { global.console.log(m); } }
    });
  }

  if (global.document.readyState !== 'loading') { start(); }
  else { TW.dom.on(global.document, 'DOMContentLoaded', start); }
})(this);
