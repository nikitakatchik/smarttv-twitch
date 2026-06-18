'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./_load');

function loadNet(XHR, timers) {
  return loadCore(['core/polyfill.js', 'core/util.js', 'core/net.js'], {
    XMLHttpRequest: XHR,
    setTimeout(fn, ms) { timers.push({ fn, ms, cleared: false }); return timers.length - 1; },
    clearTimeout(id) { if (timers[id]) { timers[id].cleared = true; } },
  }).TW;
}

test('net.send has a JS watchdog for hung legacy XHR requests', () => {
  const timers = [];
  let aborted = 0;
  function XHR() {}
  XHR.prototype.open = function () {};
  XHR.prototype.setRequestHeader = function () {};
  XHR.prototype.abort = function () { aborted++; };
  XHR.prototype.send = function () {};
  const TW = loadNet(XHR, timers);
  let done = null;

  TW.net.send({ url: 'https://example/hang', timeout: 77 }, (status, text) => { done = { status, text }; });

  assert.equal(timers[0].ms, 77);
  assert.equal(done, null);
  timers[0].fn();
  assert.equal(aborted, 1);
  assert.deepEqual(done, { status: 0, text: '' });
});

test('net.send clears the watchdog after a completed response', () => {
  const timers = [];
  function XHR() {}
  XHR.prototype.open = function () {};
  XHR.prototype.setRequestHeader = function () {};
  XHR.prototype.send = function () {
    this.readyState = 4;
    this.status = 200;
    this.responseText = 'ok';
    this.onreadystatechange();
  };
  const TW = loadNet(XHR, timers);
  const calls = [];

  TW.net.send({ url: 'https://example/ok', timeout: 77 }, (status, text) => { calls.push({ status, text }); });
  timers[0].fn();

  assert.deepEqual(calls, [{ status: 200, text: 'ok' }]);
  assert.equal(timers[0].cleared, true);
});
