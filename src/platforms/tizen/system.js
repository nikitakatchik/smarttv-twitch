/*!
 * platforms/tizen/system.js — Tizen system services.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  TW.platform.system = {
    setScreensaver: function (on) {
      try {
        if (global.webapis && webapis.appcommon) {
          webapis.appcommon.setScreenSaver(on
            ? webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF
            : webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_ON);
        }
      } catch (e) {}
    },
    setVolumeControl: function () { /* handled natively */ },
    exit: function () {
      try { global.tizen.application.getCurrentApplication().exit(); }
      catch (e) { TW.log.info('exit() unavailable: ' + e); }
    }
  };

})(this);
