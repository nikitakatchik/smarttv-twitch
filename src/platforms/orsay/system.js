/*!
 * platforms/orsay/system.js — legacy system services via the Common API.
 *
 * Uses the lightweight legacy Widget API for returning to Smart Hub. We do not
 * call Common.API.Plugin here: legacy emulators log "Plugin is not embeded yet"
 * unless the vendor plugin object is also present in index.html.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  var widget = (global.Common && Common.API && Common.API.Widget) ? new Common.API.Widget() : null;
  var readySent = !!global.twOrsayWidgetReadySent;

  function focusKeyTarget() {
    var doc = global.document;
    if (!doc) { return; }
    var target = doc.getElementById ? doc.getElementById('tw-orsay-focus') : null;
    try {
      if (target && target.focus) { target.focus(); return; }
      if (doc.body && doc.body.focus) { doc.body.focus(); }
    } catch (e) {}
  }

  TW.platform.system = {
    ready: function () {
      global.twOrsayAppReady = true;
      focusKeyTarget();
      try {
        if (widget && widget.sendReadyEvent && !readySent) {
          widget.sendReadyEvent();
          readySent = true;
          global.twOrsayWidgetReadySent = true;
        }
      } catch (e) {}
    },
    setScreensaver: function () {},
    setVolumeControl: function () { /* handled natively by the TV */ },
    exit: function () {
      try { if (widget) { widget.sendReturnEvent(); return; } } catch (e) {}
      TW.log.info('exit() — no Common API widget; staying in app');
    }
  };

})(this);
