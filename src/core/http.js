/*!
 * core/http.js — XMLHttpRequest with progressive-backoff retries.
 *
 * XHR is the only transport available on every target (no fetch on old TVs).
 * The retry curve is inherited from the original app: tight retries first,
 * then backing off to minutes, because flaky Wi-Fi on a TV is the norm.
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  function rewrite(url) {
    return TW.http && TW.http.rewrite ? TW.http.rewrite(url) : url;
  }

  function backoffFor(attempt) {
    if (attempt < 10) { return 500 + attempt * 100; }
    switch (attempt) {
      case 10: return 5000;
      case 11: return 10000;
      case 12: return 30000;
      case 13: return 60000;
      default: return 300000;
    }
  }

  /**
   * opts: { method, url, headers, body, timeout, retries, onProgress }
   * Calls onOk(responseText, xhr) on HTTP 2xx, onFail(status, xhr) when all
   * retries are exhausted.
   */
  function request(opts, onOk, onFail) {
    var method = opts.method || 'GET';
    var retries = opts.retries == null ? 15 : opts.retries;
    var attempt = 0;

    function attemptOnce() {
      var xhr = new global.XMLHttpRequest();
      var finished = false;
      var timer = null;
      function finish(fn) {
        if (finished) { return; }
        finished = true;
        if (timer != null && global.clearTimeout) { try { global.clearTimeout(timer); } catch (e0) {} }
        fn();
      }
      try {
        xhr.open(method, rewrite(opts.url), true);
        if (opts.headers) {
          for (var h in opts.headers) {
            if (opts.headers.hasOwnProperty(h)) {
              try { xhr.setRequestHeader(h, opts.headers[h]); } catch (e) {}
            }
          }
        }
        xhr.timeout = opts.timeout || (backoffFor(attempt) + 5000);
        timer = global.setTimeout(function () {
          try { if (xhr.abort) { xhr.abort(); } } catch (e1) {}
          finish(function () { retry(); });
        }, xhr.timeout);
        xhr.ontimeout = function () { finish(function () { retry(); }); };
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) { return; }
          finish(function () {
            var status = xhr.status;
            if (status >= 200 && status < 300) { onOk(xhr.responseText, xhr); return; }
            // A 4xx (auth, bad request, not found) will never succeed on retry, so
            // fail fast instead of stalling for ~12 min behind the backoff curve —
            // that's what turned a logged-in 401 into an "infinite" spinner. Retry
            // only genuinely transient failures: network errors (status 0),
            // timeouts (ontimeout), 5xx, and 429 (rate limited).
            if (status >= 400 && status < 500 && status !== 429) {
              if (onFail) { onFail(status, xhr); }
              return;
            }
            retry();
          });
        };
        xhr.send(opts.body == null ? null : opts.body);
      } catch (err) {
        finish(function () { retry(); });
      }
    }

    function retry() {
      attempt++;
      if (attempt > retries) {
        if (onFail) { onFail(0); }
        return;
      }
      if (opts.onProgress) { opts.onProgress(attempt, retries); }
      TW.delay(backoffFor(attempt), attemptOnce);
    }

    attemptOnce();
  }

  /** Convenience: GET + JSON.parse. */
  function getJson(url, headers, onOk, onFail, opts) {
    opts = TW.extend({ method: 'GET', url: url, headers: headers }, opts);
    request(opts, function (text, xhr) {
      try { onOk(JSON.parse(text), xhr); }
      catch (e) { if (onFail) { onFail(-1, xhr, e); } }
    }, onFail);
  }

  /** Convenience: POST a JSON body, parse a JSON response. */
  function postJson(url, headers, bodyObj, onOk, onFail, opts) {
    headers = TW.extend({ 'Content-Type': 'application/json' }, headers);
    opts = TW.extend({
      method: 'POST', url: url, headers: headers, body: JSON.stringify(bodyObj)
    }, opts);
    request(opts, function (text, xhr) {
      try { onOk(JSON.parse(text), xhr); }
      catch (e) { if (onFail) { onFail(-1, xhr, e); } }
    }, onFail);
  }

  TW.http = { rewrite: function (url) { return url; }, request: request, getJson: getJson, postJson: postJson, backoffFor: backoffFor };
})(this);
