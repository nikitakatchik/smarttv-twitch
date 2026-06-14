/*!
 * core/net.js — a single XHR helper used by the authenticated APIs, plus a
 * per-platform URL rewrite hook.
 *
 * TW.http (the browse/playback transport) retries hard and only reports success
 * or final failure — it can't surface a 400 body, which the OAuth device flow
 * needs ("authorization_pending"). TW.net.send does ONE request and hands back
 * the raw (status, text) so auth.js + helix.js can read non-2xx responses.
 *
 * TW.net.rewrite is the identity on real TVs — native XHR sends no browser
 * Origin, so id.twitch.tv / api.twitch.tv are reached directly. The browser
 * harness overrides it (platforms/web/boot.js) to route through the dev CORS
 * proxy, exactly like playback.
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
      try { xhr = new global.XMLHttpRequest(); } catch (e) { onDone(0, ''); return; }
      try {
        xhr.open(opts.method || 'GET', TW.net.rewrite(opts.url), true);
        var h = opts.headers || {};
        for (var k in h) {
          if (h.hasOwnProperty(k)) { try { xhr.setRequestHeader(k, h[k]); } catch (e2) {} }
        }
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) { return; }
          onDone(xhr.status, xhr.responseText);
        };
        xhr.send(opts.body == null ? null : opts.body);
      } catch (e3) { onDone(0, ''); }
    }
  };
})(this);
