/*!
 * core/keys.js — canonical remote-control keys.
 *
 * Every generation of Samsung TV emits DIFFERENT numeric keyCodes for the same
 * physical button (e.g. "Up" is 29460 on Orsay but 38 on Tizen). The app core
 * only ever speaks in these symbolic names; each platform adapter supplies a
 * map from its native keyCodes to these constants (see platforms/<x>/keys.js).
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  // String constants (not numbers) so a stray native keyCode can never collide
  // with a canonical key by accident.
  TW.KEY = {
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    UP: 'UP',
    DOWN: 'DOWN',
    ENTER: 'ENTER',
    BACK: 'BACK',        // a.k.a. RETURN / Back

    RED: 'RED',
    GREEN: 'GREEN',
    YELLOW: 'YELLOW',

    PLAY: 'PLAY',
    PAUSE: 'PAUSE',
    PLAYPAUSE: 'PLAYPAUSE',
    STOP: 'STOP',

    CH_UP: 'CH_UP',
    CH_DOWN: 'CH_DOWN',
    VOL_UP: 'VOL_UP',
    VOL_DOWN: 'VOL_DOWN',
    MUTE: 'MUTE',

    N0: 'N0', N1: 'N1', N2: 'N2', N3: 'N3', N4: 'N4',
    N5: 'N5', N6: 'N6', N7: 'N7', N8: 'N8', N9: 'N9'
  };
})(this);
