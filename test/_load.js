/*
 * test/_load.js — load the global-namespaced core into a sandbox.
 *
 * The core ships as ordered <script> files that attach to a global `TW` (no ES
 * modules — old TVs can't do them). To unit-test them in Node we run each file
 * in a `vm` context whose top-level `this` is the sandbox global, exactly like
 * a browser. No jsdom / dependencies required.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.resolve(__dirname, '..', 'src');

function loadCore(files, extraGlobals) {
  const g = Object.assign({
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Math, JSON, Date, parseInt, parseFloat, encodeURIComponent, RegExp,
  }, extraGlobals || {});
  g.window = g;
  g.self = g;
  g.globalThis = g;
  vm.createContext(g);
  for (const f of files) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    vm.runInContext(code, g, { filename: f });
  }
  return g;
}

// A scripted XMLHttpRequest mock. `responder(method, url, body)` returns
// { status, text } (or throws). Records the last request for assertions.
function mockXHR(responder) {
  const log = [];
  function XHR() { this._headers = {}; }
  XHR.prototype.open = function (m, u) { this._m = m; this._u = u; };
  XHR.prototype.setRequestHeader = function (k, v) { this._headers[k] = v; };
  XHR.prototype.send = function (body) {
    const rec = { method: this._m, url: this._u, headers: this._headers, body };
    log.push(rec);
    const r = responder(rec);
    this.readyState = 4;
    this.status = r.status;
    this.responseText = r.text;
    if (this.onreadystatechange) { this.onreadystatechange(); }
  };
  XHR.log = log;
  return XHR;
}

module.exports = { loadCore, mockXHR };
