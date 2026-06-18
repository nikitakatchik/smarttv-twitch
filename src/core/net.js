/*!
 * core/net.js — a single XHR helper used by the authenticated APIs, plus a
 * per-platform URL rewrite hook.
 *
 * TW.http (the browse/playback transport) retries hard and only reports success
 * or final failure — it can't surface a 400 body, which the OAuth device flow
 * needs ("authorization_pending"). TW.net.send does ONE request and hands back
 * the raw (status, text) so auth.js + helix.js can read non-2xx responses.
 *
 * TW.net.rewrite defaults to identity. Platform boot files may override it when
 * a runtime needs an HTTP helper, for example the browser harness CORS proxy.
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  TW.net = {
    rewrite: function (url) { return url; },

    // opts: { method, url, headers, body }. onDone(status, text) fires once for
    // ANY completed response (including 4xx); status 0 means transport error.
    send: function (opts, onDone) {
      var xhr;
      var finished = false;
      var timeout = opts.timeout || 8000;
      var timer = null;
      function finish(status, text) {
        if (finished) { return; }
        finished = true;
        if (timer != null && global.clearTimeout) { try { global.clearTimeout(timer); } catch (e0) {} }
        onDone(status, text);
      }
      try { xhr = new global.XMLHttpRequest(); } catch (e) { onDone(0, ''); return; }
      try {
        xhr.open(opts.method || 'GET', TW.net.rewrite(opts.url), true);
        var h = opts.headers || {};
        for (var k in h) {
          if (h.hasOwnProperty(k)) { try { xhr.setRequestHeader(k, h[k]); } catch (e2) {} }
        }
        try { xhr.timeout = timeout; } catch (e3) {}
        timer = global.setTimeout(function () {
          try { if (xhr.abort) { xhr.abort(); } } catch (e4) {}
          finish(0, '');
        }, timeout);
        xhr.ontimeout = function () { finish(0, ''); };
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) { return; }
          finish(xhr.status, xhr.responseText);
        };
        xhr.send(opts.body == null ? null : opts.body);
      } catch (e5) { finish(0, ''); }
    }
  };
})(this);
