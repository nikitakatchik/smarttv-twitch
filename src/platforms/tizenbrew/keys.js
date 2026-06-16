/*!
 * platforms/tizenbrew/keys.js — Tizen remote keyCodes -> canonical keys.
 *
 * Inside TizenBrew the page runs in the TV's Tizen webview, so it receives the
 * same numeric keyCodes as the standalone Tizen build. TizenBrew already
 * registers this module's package.json `keys` (and the colour keys) via
 * tizen.tvinputdevice.registerKey before navigating here, but we re-register
 * defensively in case the page retains the `tizen` global — intersecting with
 * getSupportedKeys() so an unknown name never throws InvalidValuesError.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var KEY = TW.KEY;
  TW.platform = TW.platform || {};

  var MAP = {
    37: KEY.LEFT, 38: KEY.UP, 39: KEY.RIGHT, 40: KEY.DOWN,
    13: KEY.ENTER, 10009: KEY.BACK, 461: KEY.BACK,
    403: KEY.RED, 404: KEY.GREEN, 405: KEY.YELLOW,
    10252: KEY.PLAYPAUSE, 415: KEY.PLAY, 19: KEY.PAUSE, 413: KEY.STOP,
    427: KEY.CH_UP, 428: KEY.CH_DOWN,
    48: KEY.N0, 49: KEY.N1, 50: KEY.N2, 51: KEY.N3, 52: KEY.N4,
    53: KEY.N5, 54: KEY.N6, 55: KEY.N7, 56: KEY.N8, 57: KEY.N9
  };

  TW.platform.keys = {
    map: function (e) { return MAP[e.keyCode] || null; },
    register: function () {
      if (!global.tizen || !global.tizen.tvinputdevice) { return; }
      var idev = global.tizen.tvinputdevice;
      var names = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow',
        'ChannelUp', 'ChannelDown', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      var supported = null;
      try {
        var list = idev.getSupportedKeys();
        supported = {};
        for (var s = 0; s < list.length; s++) { supported[list[s].name] = true; }
      } catch (e) { supported = null; }   // older API: just try them all
      for (var i = 0; i < names.length; i++) {
        if (supported && !supported[names[i]]) { continue; }
        try { idev.registerKey(names[i]); } catch (e2) {}
      }
    }
  };
})(this);
