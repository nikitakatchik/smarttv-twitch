/*!
 * core/i18n.js — tiny string catalogue.
 *
 * Replaces the old global STR_* variables. Each lang/<code>.js registers a
 * dictionary; TW.i18n.t('CHANNELS') looks it up in the active language and
 * falls back to English, then to the key itself.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var catalogs = {};
  var active = 'en';

  var i18n = {
    register: function (code, dict) { catalogs[code] = dict; },

    setLanguage: function (code) {
      active = catalogs[code] ? code : 'en';
      return active;
    },

    language: function () { return active; },
    available: function () {
      var out = [];
      for (var k in catalogs) { if (catalogs.hasOwnProperty(k)) { out.push(k); } }
      return out;
    },

    /** Translate a key, with optional {0},{1}… substitution. */
    t: function (key) {
      var dict = catalogs[active] || {};
      var s = dict[key];
      if (s == null) { s = (catalogs.en && catalogs.en[key]); }
      if (s == null) { s = key; }
      for (var i = 1; i < arguments.length; i++) {
        s = s.replace('{' + (i - 1) + '}', arguments[i]);
      }
      return s;
    }
  };

  TW.i18n = i18n;
})(this);
