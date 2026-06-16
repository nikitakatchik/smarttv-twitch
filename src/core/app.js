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
      TW.sceneManager.register('channelPage', new TW.ChannelPageScene(adapter));
      TW.sceneManager.register('channel', new TW.ChannelScene(adapter));
      TW.sceneManager.register('login', new TW.LoginScene(adapter));

      wireKeys(adapter);

      TW.sceneManager.show('browser');
      TW.sceneManager.focus('browser');
    },

    // opts (optional): { stream: <liveTile>, vod: <vodItem>, from: 'channelPage' }.
    // A vod plays that past broadcast; `from` is where BACK returns to.
    goToChannel: function (login, opts) {
      opts = opts || {};
      TW.sceneManager.hide('browser');
      TW.sceneManager.hide('channelPage');
      TW.sceneManager.hide('login');
      TW.sceneManager.show('channel', {
        login: login,
        vod: opts.vod,
        item: opts.item,
        stream: opts.stream,
        from: opts.from
      });
      TW.sceneManager.focus('channel');
    },

    playChannelItem: function (login, item) {
      this.goToChannel(login, { item: item, from: 'channelPage' });
    },

    // A channel's landing page (info + VODs); reached from the Following tab.
    goToChannelPage: function (login) {
      TW.sceneManager.hide('browser');
      TW.sceneManager.hide('channel');
      TW.sceneManager.hide('login');
      TW.sceneManager.show('channelPage', { login: login });
      TW.sceneManager.focus('channelPage');
    },

    goToBrowser: function (mode) {
      TW.sceneManager.hide('channel');
      TW.sceneManager.hide('channelPage');
      TW.sceneManager.hide('login');
      var browser = TW.sceneManager.get('browser');
      if (browser) { browser.pendingMode = (mode == null ? null : mode); }
      TW.sceneManager.show('browser');
      TW.sceneManager.focus('browser');
    },

    goToLogin: function () {
      TW.sceneManager.hide('browser');
      TW.sceneManager.hide('channel');
      TW.sceneManager.hide('channelPage');
      TW.sceneManager.show('login');
      TW.sceneManager.focus('login');
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
