/*!
 * core/polyfill.js — minimal ES5 shims for the oldest targets.
 *
 * The 2013–2014 "Orsay" TVs run an old WebKit (~535–537). Everything we ship is
 * hand-written ES5, and these few shims (JSON, a couple of Array/Function
 * helpers) defensively backfill anything an old build might miss — so the exact
 * same bundle runs on old Orsay panels and supported Tizen WebViews alike. All are
 * no-ops where the platform already provides the feature, safe to load anywhere.
 */
(function (global) {
  'use strict';

  // --- Function.prototype.bind (ES5; missing on MAPLE) --------------------
  if (!Function.prototype.bind) {
    Function.prototype.bind = function (ctx) {
      var fn = this;
      var bound = Array.prototype.slice.call(arguments, 1);
      return function () {
        return fn.apply(ctx, bound.concat(Array.prototype.slice.call(arguments)));
      };
    };
  }

  // --- Array.prototype.forEach / map / filter / indexOf -------------------
  if (!Array.prototype.forEach) {
    Array.prototype.forEach = function (cb, ctx) {
      for (var i = 0; i < this.length; i++) { cb.call(ctx, this[i], i, this); }
    };
  }
  if (!Array.prototype.map) {
    Array.prototype.map = function (cb, ctx) {
      var out = [];
      for (var i = 0; i < this.length; i++) { out.push(cb.call(ctx, this[i], i, this)); }
      return out;
    };
  }
  if (!Array.prototype.filter) {
    Array.prototype.filter = function (cb, ctx) {
      var out = [];
      for (var i = 0; i < this.length; i++) {
        if (cb.call(ctx, this[i], i, this)) { out.push(this[i]); }
      }
      return out;
    };
  }
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (needle) {
      for (var i = 0; i < this.length; i++) { if (this[i] === needle) { return i; } }
      return -1;
    };
  }

  // --- String.prototype.trim ---------------------------------------------
  if (!String.prototype.trim) {
    String.prototype.trim = function () {
      return this.replace(/^[\s﻿\xA0]+|[\s﻿\xA0]+$/g, '');
    };
  }

  // --- Date.now -----------------------------------------------------------
  if (!Date.now) {
    Date.now = function () { return new Date().getTime(); };
  }

  // --- JSON (Crockford-style minimal subset) ------------------------------
  // MAPLE has no native JSON. We only ever parse (Twitch responses) and
  // stringify (GraphQL request bodies), so a compact implementation is enough.
  if (!global.JSON) {
    var ESCAPABLE = /[\\"\u0000-\u001f]/g;
    var ESCAPES = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' };

    global.JSON = {
      parse: function (text) {
        // eslint-disable-next-line no-eval
        return eval('(' + text + ')');
      },
      stringify: function stringify(value) {
        var t = typeof value;
        if (value === null || t === 'number' || t === 'boolean') { return String(value); }
        if (t === 'string') {
          // Escape backslash, double-quote and C0 control characters ONLY —
          // spaces and punctuation are legal in a JSON string and must pass
          // through unchanged.
          return '"' + value.replace(ESCAPABLE, function (ch) {
            if (ESCAPES[ch]) { return ESCAPES[ch]; }
            var code = ch.charCodeAt(0).toString(16);
            return '\\u' + '0000'.slice(code.length) + code;
          }) + '"';
        }
        if (Object.prototype.toString.call(value) === '[object Array]') {
          var items = [];
          for (var i = 0; i < value.length; i++) {
            items.push(value[i] === undefined ? 'null' : stringify(value[i]));
          }
          return '[' + items.join(',') + ']';
        }
        if (t === 'object') {
          var pairs = [];
          for (var key in value) {
            if (value.hasOwnProperty(key) && value[key] !== undefined && typeof value[key] !== 'function') {
              pairs.push(stringify(key) + ':' + stringify(value[key]));
            }
          }
          return '{' + pairs.join(',') + '}';
        }
        return 'null';
      }
    };
  }
})(this);
