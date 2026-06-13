/*!
 * platforms/web/keys.js — desktop keyboard + on-screen remote -> canonical keys.
 *
 * Mirrors a TV remote so the harness exercises the exact same key handling the
 * TVs use. Letters/digits are passed through untouched while the "Open" text
 * field is focused, so you can actually type a channel name.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var KEY = TW.KEY;
  TW.platform = TW.platform || {};

  var MAP = {
    37: KEY.LEFT, 38: KEY.UP, 39: KEY.RIGHT, 40: KEY.DOWN,
    13: KEY.ENTER, 8: KEY.BACK, 27: KEY.BACK,
    82: KEY.RED, 71: KEY.GREEN, 89: KEY.YELLOW, 66: KEY.BLUE, // R G Y B
    32: KEY.PLAYPAUSE,
    48: KEY.N0, 49: KEY.N1, 50: KEY.N2, 51: KEY.N3, 52: KEY.N4,
    53: KEY.N5, 54: KEY.N6, 55: KEY.N7, 56: KEY.N8, 57: KEY.N9,
    33: KEY.CH_UP, 34: KEY.CH_DOWN // PageUp / PageDown
  };

  // While typing into the Open field, only these reach the app; the rest are
  // left for the input element so the user can type a channel name.
  var NAV_ONLY = {};
  NAV_ONLY[KEY.LEFT] = NAV_ONLY[KEY.RIGHT] = NAV_ONLY[KEY.UP] =
    NAV_ONLY[KEY.DOWN] = NAV_ONLY[KEY.ENTER] = NAV_ONLY[KEY.BACK] = true;

  var keys = {
    map: function (e) {
      var key = MAP[e.keyCode];
      if (!key) { return null; }
      var t = e.target;
      if (t && t.id === 'tw-open-input' && !NAV_ONLY[key]) { return null; }
      return key;
    }
  };

  // Wire the on-screen D-pad: every [data-tvkey] button feeds the scene manager.
  TW.platform.installRemote = function () {
    var btns = global.document.getElementsByTagName('button');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        var k = btn.getAttribute('data-tvkey');
        if (!k) { return; }
        TW.dom.on(btn, 'click', function () { TW.sceneManager.dispatchKey(KEY[k]); });
      })(btns[i]);
    }
  };

  TW.platform.keys = keys;
})(this);
