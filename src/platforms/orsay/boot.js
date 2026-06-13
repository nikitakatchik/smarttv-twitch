/*!
 * platforms/orsay/boot.js — start the legacy widget.
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  function start() {
    TW.app.start({
      name: 'orsay',
      config: {
        screen: { width: 1280, height: 720 }
        // IMPORTANT: pre-2017 Samsung TVs cannot complete a modern TLS/SNI
        // handshake to Twitch's HTTPS-only endpoints. To make the app reach
        // Twitch on real legacy hardware, deploy the relay (see proxy/) and set:
        //   , api: { relayBase: 'https://your-relay.example.workers.dev' }
      },
      keys: TW.platform.keys,
      createPlayer: TW.platform.createPlayer,
      system: TW.platform.system,
      ime: TW.platform.ime
    });
  }

  if (global.document.readyState === 'complete') { start(); }
  else { TW.dom.on(global, 'load', start); }
})(this);
