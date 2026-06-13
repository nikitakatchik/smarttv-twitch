/*!
 * core/dom.js — a ~1 KB DOM helper that works from old Orsay WebKit to Tizen.
 *
 * Deliberately avoids classList, querySelectorAll, dataset and other things
 * that are missing or flaky on old Orsay WebKit. className is manipulated as a
 * plain string; attributes are read with getAttribute.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var doc = global.document;

  var dom = {};

  /** byId. */
  dom.get = function (id) { return doc.getElementById(id); };

  /** Create an element, optionally with className and innerHTML. */
  dom.create = function (tag, className, html) {
    var el = doc.createElement(tag);
    if (className) { el.className = className; }
    if (html != null) { el.innerHTML = html; }
    return el;
  };

  dom.hasClass = function (el, cls) {
    if (!el) { return false; }
    return (' ' + el.className + ' ').indexOf(' ' + cls + ' ') >= 0;
  };

  dom.addClass = function (el, cls) {
    if (el && !dom.hasClass(el, cls)) {
      el.className = el.className ? (el.className + ' ' + cls) : cls;
    }
  };

  dom.removeClass = function (el, cls) {
    if (!el) { return; }
    var out = (' ' + el.className + ' ').replace(' ' + cls + ' ', ' ');
    el.className = out.replace(/^\s+|\s+$/g, '');
  };

  dom.show = function (el, display) {
    if (el) { el.style.display = display || 'block'; }
  };

  dom.hide = function (el) { if (el) { el.style.display = 'none'; } };

  dom.text = function (el, value) {
    if (!el) { return; }
    if ('textContent' in el) { el.textContent = value; }
    else { el.innerText = value; }
  };

  dom.html = function (el, value) { if (el) { el.innerHTML = value; } };

  dom.attr = function (el, name, value) {
    if (value === undefined) { return el ? el.getAttribute(name) : null; }
    if (el) { el.setAttribute(name, value); }
  };

  dom.on = function (el, type, handler) {
    if (!el) { return; }
    if (el.addEventListener) { el.addEventListener(type, handler, false); }
    else if (el.attachEvent) { el.attachEvent('on' + type, handler); }
  };

  /** Escape text destined for innerHTML (stream titles are user content). */
  dom.escape = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  TW.dom = dom;
})(this);
