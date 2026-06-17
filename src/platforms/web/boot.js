/*!
 * platforms/web/boot.js — wire the harness adapter and start the app.
 *
 * Browse data + thumbnails work cross-origin, but Twitch's usher/playlist hosts
 * don't send Access-Control-Allow-Origin, so the local harness routes playback
 * through the dev server's CORS proxy (see tools/dev-server.js). Static hosts
 * such as GitHub Pages have no proxy endpoint, so the web adapter falls back to
 * Twitch's embedded player for live/VOD playback.
 *
 * URL query overrides (handy for testing):
 *   ?lang=de            UI language
 *   ?proxy=https://...  use a specific dev CORS proxy
 *   ?proxy=none         no proxy; use the static-host embed fallback
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  function qs(name) {
    var m = global.location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function isLoopbackHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' ||
      hostname === '::1' || hostname === '[::1]';
  }

  function start() {
    var cfg = { api: {} };
    if (qs('lang')) { cfg.language = qs('lang'); }
    // Handy for testing login in the harness: ?clientId=<your twitch app id>.
    if (qs('clientId')) { cfg.api.userClientId = qs('clientId'); }

    // Dev-only: the web player wraps HLS through this CORS proxy. Static Pages
    // builds intentionally leave it blank; there is no /proxy route there.
    var proxy = qs('proxy');
    TW.platform.proxyBase = (proxy === 'none') ? ''
      : (proxy || (isLoopbackHost(global.location.hostname) ?
        (global.location.protocol + '//' + global.location.host) : ''));
    TW.platform.useEmbedPlayer = !TW.platform.proxyBase;

    // Dev-only: route the authenticated APIs (id/api.twitch.tv) through the same
    // CORS proxy. Static Pages builds and real TVs leave TW.net.rewrite as the
    // identity and go direct.
    TW.net.rewrite = function (url) {
      var base = TW.platform.proxyBase;
      if (base && (/^https:\/\//).test(url)) {
        return base.replace(/\/$/, '') + '/proxy?url=' + encodeURIComponent(url);
      }
      return url;
    };

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
