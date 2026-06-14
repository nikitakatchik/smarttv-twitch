/*!
 * core/storage.js — tiny key/value persistence.
 *
 * Used to remember the logged-in token + the user's Twitch app client-id across
 * launches. localStorage exists on the harness, Tizen and 2013+ Orsay WebKit;
 * an in-memory fallback keeps everything working if a panel has it disabled.
 * Keys are namespaced "tw." so we never collide with anything else on the page.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var mem = {};

  function ls() { try { return global.localStorage; } catch (e) { return null; } }

  TW.storage = {
    get: function (k) {
      var s = ls();
      if (s) { try { var v = s.getItem('tw.' + k); if (v != null) { return v; } } catch (e) {} }
      return mem[k] == null ? null : mem[k];
    },
    set: function (k, v) {
      var s = ls();
      if (s) { try { s.setItem('tw.' + k, v); return; } catch (e) {} }
      mem[k] = v;
    },
    remove: function (k) {
      var s = ls();
      if (s) { try { s.removeItem('tw.' + k); } catch (e) {} }
      delete mem[k];
    }
  };
})(this);
