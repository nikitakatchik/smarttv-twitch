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
      try {
        xhr.open(method, opts.url, true);
        if (opts.headers) {
          for (var h in opts.headers) {
            if (opts.headers.hasOwnProperty(h)) {
              try { xhr.setRequestHeader(h, opts.headers[h]); } catch (e) {}
            }
          }
        }
        xhr.timeout = opts.timeout || (backoffFor(attempt) + 5000);
        xhr.ontimeout = function () { retry(); };
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) { return; }
          if (xhr.status >= 200 && xhr.status < 300) {
            onOk(xhr.responseText, xhr);
          } else {
            retry();
          }
        };
        xhr.send(opts.body == null ? null : opts.body);
      } catch (err) {
        retry();
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

  TW.http = { request: request, getJson: getJson, postJson: postJson, backoffFor: backoffFor };
})(this);
