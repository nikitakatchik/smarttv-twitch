/*!
 * platforms/web/boot.js — wire the harness adapter and start the app.
 *
 * Browsers enforce CORS that native TV players don't, and Twitch's usher /
 * playlist hosts don't send Access-Control-Allow-Origin for arbitrary origins,
 * so by default the harness routes Twitch traffic through the dev server's own
 * relay (which rewrites the playlists). This also mirrors exactly how an old
 * Orsay TV reaches Twitch. Pass ?relay=none to attempt the direct path.
 *
 * URL query overrides (handy for testing):
 *   ?lang=de            UI language
 *   ?backend=proxy      use Helix-via-proxy instead of public GraphQL
 *   ?proxy=https://...  proxy base (implies backend=proxy)
 *   ?relay=https://...  route Twitch traffic through a specific relay
 *   ?relay=none         no relay (direct; playback usually blocked by CORS)
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  function qs(name) {
    var m = global.location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function start() {
    var cfg = { api: {} };
    if (qs('lang')) { cfg.language = qs('lang'); }
    if (qs('backend')) { cfg.api.backend = qs('backend'); }
    if (qs('proxy')) { cfg.api.backend = 'proxy'; cfg.api.proxyBase = qs('proxy'); }

    // Default: route through the dev server's own relay so playback works.
    var relay = qs('relay');
    if (relay === 'none') { cfg.api.relayBase = ''; }
    else { cfg.api.relayBase = relay || (global.location.protocol + '//' + global.location.host); }

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
