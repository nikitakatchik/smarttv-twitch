/*!
 * platforms/tizenbrew/system.js — system services, defensively guarded.
 *
 * Under TizenBrew the module page may or may not retain the `tizen`/`webapis`
 * globals, so every call is wrapped and degrades to a no-op. exit() returns to
 * TizenBrew's menu (the page got here by a top-level navigation, so history.back
 * lands back on the TizenBrew UI) rather than killing the whole host app.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  TW.platform.system = {
    setScreensaver: function (on) {
      try {
        if (global.webapis && global.webapis.appcommon) {
          global.webapis.appcommon.setScreenSaver(on
            ? global.webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF
            : global.webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_ON);
        }
      } catch (e) {}
    },
    setVolumeControl: function () { /* handled natively */ },
    exit: function () {
      try {
        if (global.history && global.history.length > 1) { global.history.back(); return; }
      } catch (e) {}
      try { global.tizen.application.getCurrentApplication().exit(); }
      catch (e2) { TW.log.info('exit() no-op under TizenBrew'); }
    }
  };

})(this);
