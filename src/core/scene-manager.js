/*!
 * core/scene-manager.js — a ~60-line replacement for Samsung's sf.scene.
 *
 * The original app leaned on the proprietary AppsFramework scene manager
 * (sf.scene.show/hide/focus + the handle* lifecycle), which only exists on
 * pre-2015 Orsay firmware. This reimplements the same lifecycle in portable
 * ES5 so the identical scenes run on Orsay, Tizen and the desktop harness.
 *
 * A scene is any object that may implement:
 *   initialize()            once, lazily, before first show
 *   handleShow(data)        becomes visible
 *   handleHide()            becomes hidden
 *   handleFocus()           gains key focus
 *   handleBlur()            loses key focus
 *   handleKeyDown(key)      a canonical TW.KEY.* while focused
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var scenes = {};
  var initialized = {};
  var focused = null;

  function call(name, method, arg) {
    var s = scenes[name];
    if (s && typeof s[method] === 'function') { return s[method](arg); }
  }

  var mgr = {
    register: function (name, scene) { scenes[name] = scene; return scene; },
    get: function (name) { return scenes[name]; },
    focusedName: function () { return focused; },

    show: function (name, data) {
      if (!initialized[name]) { initialized[name] = true; call(name, 'initialize'); }
      call(name, 'handleShow', data);
    },

    hide: function (name) { call(name, 'handleHide'); },

    focus: function (name) {
      if (focused && focused !== name) { call(focused, 'handleBlur'); }
      focused = name;
      call(name, 'handleFocus');
    },

    /** Route a canonical key to the focused scene. Returns false if unhandled. */
    dispatchKey: function (key) {
      if (!focused) { return false; }
      var r = call(focused, 'handleKeyDown', key);
      return r !== false;
    }
  };

  TW.sceneManager = mgr;
})(this);
