/*!
 * platforms/orsay/keys.js — legacy remote keyCodes -> canonical keys.
 *
 * These numeric codes are the Samsung "Maple Legacy" values and are stable
 * across the 2013 F / 2014 H Orsay generations (the same values
 * Common.API.TVKeyValue exposes). Hard-coded so the adapter doesn't depend on
 * the legacy Common API being present.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var KEY = TW.KEY;
  TW.platform = TW.platform || {};

  var MAP = {
    4: KEY.LEFT, 5: KEY.RIGHT, 29460: KEY.UP, 29461: KEY.DOWN,
    29443: KEY.ENTER, 88: KEY.BACK,            // RETURN acts as Back
    45: KEY.BACK, 10009: KEY.BACK, 10182: KEY.BACK,
    108: KEY.RED, 20: KEY.GREEN, 21: KEY.YELLOW,
    68: KEY.CH_UP, 65: KEY.CH_DOWN,
    7: KEY.VOL_UP, 11: KEY.VOL_DOWN, 27: KEY.MUTE,
    71: KEY.PLAY, 74: KEY.PAUSE, 70: KEY.STOP
  };

  TW.platform.keys = {
    map: function (e) { return MAP[e.keyCode] || null; },
    target: function () {
      return global.document && global.document.getElementById
        ? global.document.getElementById('tw-orsay-focus')
        : null;
    }
  };
})(this);
