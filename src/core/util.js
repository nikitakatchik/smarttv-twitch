/*!
 * core/util.js — the TW namespace root + tiny helpers.
 *
 * Every module hangs off the global `TW` object and the files are loaded with
 * ordered <script> tags (no bundler / ES modules: old Orsay WebKit can't do them).
 */
(function (global) {
  'use strict';

  var TW = global.TW || {};
  global.TW = TW;

  TW.version = '4.0.0';

  /** No-op. */
  TW.noop = function () {};

  /** Shallow-merge source's own keys into target. */
  TW.extend = function (target, source) {
    if (source) {
      for (var key in source) {
        if (source.hasOwnProperty(key)) { target[key] = source[key]; }
      }
    }
    return target;
  };

  /** Insert thousands separators: 12345 -> "12,345". */
  TW.addCommas = function (n) {
    var s = String(n);
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(s)) { s = s.replace(rgx, '$1,$2'); }
    return s;
  };

  /** setTimeout wrapper that reads in call order. */
  TW.delay = function (ms, fn) { return global.setTimeout(fn, ms); };

  /** Clamp n into [min, max]. */
  TW.clamp = function (n, min, max) {
    return n < min ? min : (n > max ? max : n);
  };

  /**
   * Lightweight logger. Old TVs have no console; the original app abused
   * window.alert() for tracing, which is awful on real hardware. We funnel
   * everything through here and let each platform decide where it goes.
   */
  var sink = (global.console && global.console.log)
    ? function (msg) { global.console.log(msg); }
    : TW.noop;

  TW.log = {
    setSink: function (fn) { sink = fn || TW.noop; },
    info: function (msg) { sink('[tw] ' + msg); },
    warn: function (msg) { sink('[tw][warn] ' + msg); },
    error: function (msg) { sink('[tw][error] ' + msg); }
  };
})(this);
