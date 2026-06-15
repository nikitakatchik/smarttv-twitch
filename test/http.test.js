'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, mockXHR } = require('./_load');

function loadHttp(responder) {
  const XHR = mockXHR(responder);
  const g = loadCore(['core/polyfill.js', 'core/util.js', 'core/http.js'], { XMLHttpRequest: XHR });
  g.TW.delay = function (ms, fn) { fn(); }; // run the backoff synchronously in tests
  return { TW: g.TW, XHR };
}

// Regression: a logged-in 401 on GraphQL used to be retried 15x over ~12 minutes
// (the backoff curve meant for flaky Wi-Fi), which presented as an "infinite"
// spinner. A 4xx must fail fast — exactly one attempt, surfaced to onFail.
test('http.request fails fast on a 401 (no retry storm)', () => {
  let failStatus = null;
  const { TW, XHR } = loadHttp(() => ({ status: 401, text: '' }));
  TW.http.request({ url: 'https://example/y', retries: 15 }, () => {}, (s) => { failStatus = s; });
  assert.equal(XHR.log.length, 1);   // one attempt — no retries on an auth error
  assert.equal(failStatus, 401);     // the real status is surfaced, not 0
});

test('http.request fails fast on a 404 too (4xx surfaced, not retried)', () => {
  let failStatus = null;
  const { TW, XHR } = loadHttp(() => ({ status: 404, text: '' }));
  TW.http.request({ url: 'https://example/y', retries: 15 }, () => {}, (s) => { failStatus = s; });
  assert.equal(XHR.log.length, 1);
  assert.equal(failStatus, 404);
});

test('http.request returns 2xx bodies through onOk', () => {
  let body = null;
  const { TW, XHR } = loadHttp(() => ({ status: 200, text: 'ok' }));
  TW.http.request({ url: 'https://example/y' }, (text) => { body = text; }, () => {});
  assert.equal(XHR.log.length, 1);
  assert.equal(body, 'ok');
});

// The other side of the fail-fast change: transient failures MUST still retry,
// so a real network blip doesn't kill a request that would have recovered.
test('http.request retries a 5xx and succeeds when it clears', () => {
  let n = 0, body = null;
  const { TW, XHR } = loadHttp(() => { n++; return n < 3 ? { status: 503, text: '' } : { status: 200, text: 'ok' }; });
  TW.http.request({ url: 'https://example/y', retries: 5 }, (text) => { body = text; }, () => {});
  assert.equal(XHR.log.length, 3); // 503, 503, 200
  assert.equal(body, 'ok');
});

test('http.request retries 429 (rate limited) and a network error (status 0)', () => {
  for (const status of [429, 0]) {
    let failed = false;
    const { TW, XHR } = loadHttp(() => ({ status, text: '' }));
    TW.http.request({ url: 'https://example/y', retries: 2 }, () => {}, () => { failed = true; });
    assert.equal(XHR.log.length, 3, 'status ' + status + ' retries twice then gives up'); // 1 + 2 retries
    assert.ok(failed);
  }
});
