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
        // 2013–2014 Orsay panels reach Twitch directly; nothing else to set.
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
