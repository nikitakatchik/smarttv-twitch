/*!
 * platforms/web/boot.js — wire the harness adapter and start the app.
 *
 * Browse data + thumbnails work cross-origin, but Twitch's usher/playlist hosts
 * don't send Access-Control-Allow-Origin, so the harness can't fetch the HLS
 * chain directly. As a DEV-ONLY convenience it routes playback through the dev
 * server's CORS proxy (see tools/dev-server.js). This is harness-only — no
 * shipped TV build does any of this; real TVs play directly.
 *
 * URL query overrides (handy for testing):
 *   ?lang=de            UI language
 *   ?proxy=https://...  use a specific dev CORS proxy
 *   ?proxy=none         no proxy (direct; playback usually blocked by CORS)
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  function qs(name) {
    var m = global.location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function start() {
    var cfg = { api: {} };
    if (qs('lang')) { cfg.language = qs('lang'); }

    // Dev-only: the web player wraps the HLS master URL through this CORS proxy.
    var proxy = qs('proxy');
    TW.platform.proxyBase = (proxy === 'none') ? ''
      : (proxy || (global.location.protocol + '//' + global.location.host));

    TW.app.start({
      name: 'web',
      config: cfg,
      keys: TW.platform.keys,
      createPlayer: TW.platform.createPlayer,
      system: TW.platform.system,
      log: function (m) { if (global.console) { global.console.log(m); } }
    });

    if (TW.platform.installRemote) { TW.platform.installRemote(); }
  }

  if (global.document.readyState !== 'loading') { start(); }
  else { TW.dom.on(global.document, 'DOMContentLoaded', start); }
})(this);
