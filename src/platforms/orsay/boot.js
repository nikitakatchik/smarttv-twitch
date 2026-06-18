/*!
 * platforms/orsay/boot.js — start the legacy widget.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var started = false;

  function start() {
    if (started) { return; }
    started = true;
    TW.app.start({
      name: 'orsay',
      config: {
        screen: { width: 1280, height: 720 }
      },
      keys: TW.platform.keys,
      createPlayer: TW.platform.createPlayer,
      system: TW.platform.system,
      auth: { enabled: false },
      browse: { deferInitialLoadMs: 900 },
      chat: { enabled: false }
    });
  }

  if (global.document && global.document.readyState === 'loading') {
    TW.dom.on(global.document, 'DOMContentLoaded', start);
    TW.dom.on(global, 'load', start);
  }
  start();
})(this);
