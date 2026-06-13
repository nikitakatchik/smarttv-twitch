/*!
 * platforms/web/system.js — system services are no-ops in a browser.
 */
(function (global) {
  'use strict';
  var TW = global.TW;
  TW.platform = TW.platform || {};

  TW.platform.system = {
    setScreensaver: function () {},
    setVolumeControl: function () {},
    exit: function () { TW.log.info('exit() — no-op in the browser harness'); }
  };

  // No IME object: the harness uses a real keyboard on the focused input.
})(this);
