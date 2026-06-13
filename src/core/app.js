/*!
 * core/app.js — application bootstrap.
 *
 * A platform boot file builds a platform adapter and calls TW.app.start(it).
 * The adapter is the ONLY platform-specific surface the core touches:
 *
 *   adapter.name                       'orsay' | 'tizen' | 'web'
 *   adapter.config                     optional TW.config overrides
 *   adapter.keys.map(domEvent)         native keyCode -> TW.KEY.* (or null)
 *   adapter.keys.register()            optional (Tizen registerKey)
 *   adapter.createPlayer(callbacks)    -> player (see scenes/channel-scene.js)
 *   adapter.system.setScreensaver(on,ms)
 *   adapter.system.setVolumeControl(on)
 *   adapter.system.exit()
 *   adapter.ime.edit(inputEl,opts,onDone)   optional on-screen keyboard
 *   adapter.log(msg)                   optional log sink
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  var app = {
    adapter: null,

    start: function (adapter) {
      this.adapter = adapter;

      if (adapter.config) { mergeConfig(TW.config, adapter.config); }
      if (adapter.log) { TW.log.setSink(adapter.log); }
      TW.i18n.setLanguage(TW.config.language);
      TW.log.info('starting on platform "' + adapter.name + '" (api=' + TW.api.backendName() + ')');

      if (adapter.keys && adapter.keys.register) {
        try { adapter.keys.register(); } catch (e) { TW.log.warn('key register failed: ' + e); }
      }

      TW.sceneManager.register('browser', new TW.BrowserScene(adapter));
      TW.sceneManager.register('channel', new TW.ChannelScene(adapter));

      wireKeys(adapter);

      TW.sceneManager.show('browser');
      TW.sceneManager.focus('browser');
    },

    goToChannel: function (login) {
      TW.sceneManager.hide('browser');
      TW.sceneManager.show('channel', { login: login });
      TW.sceneManager.focus('channel');
    },

    goToBrowser: function () {
      TW.sceneManager.hide('channel');
      TW.sceneManager.show('browser');
      TW.sceneManager.focus('browser');
    }
  };

  function mergeConfig(target, source) {
    for (var k in source) {
      if (!source.hasOwnProperty(k)) { continue; }
      if (target[k] && typeof target[k] === 'object' && typeof source[k] === 'object') {
        mergeConfig(target[k], source[k]);
      } else {
        target[k] = source[k];
      }
    }
  }

  function wireKeys(adapter) {
    TW.dom.on(global.document, 'keydown', function (e) {
      var key = adapter.keys.map(e);
      if (!key) { return; }
      var handled = TW.sceneManager.dispatchKey(key);
      if (handled && e.preventDefault) { e.preventDefault(); }
    });
  }

  TW.app = app;
})(this);
