/*!
 * platforms/orsay/system.js — legacy system services via the Common API.
 *
 * Uses the lightweight legacy "Common API" (Widget.js / Plugin.js, loaded from
 * $MANAGER_WIDGET in index.html) for screensaver control and returning to Smart
 * Hub — NOT the heavyweight AppsFramework the original app depended on. Every
 * call is guarded so the adapter still loads if a plugin is unavailable.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  var widget = (global.Common && Common.API && Common.API.Widget) ? new Common.API.Widget() : null;
  var plugin = (global.Common && Common.API && Common.API.Plugin) ? new Common.API.Plugin() : null;

  TW.platform.system = {
    setScreensaver: function (on) {
      try {
        if (!plugin) { return; }
        if (on) { plugin.setOffScreenSaver(); } else { plugin.setOnScreenSaver(); }
      } catch (e) {}
    },
    setVolumeControl: function () { /* handled natively by the TV */ },
    exit: function () {
      try { if (widget) { widget.sendReturnEvent(); return; } } catch (e) {}
      TW.log.info('exit() — no Common API widget; staying in app');
    }
  };

})(this);
