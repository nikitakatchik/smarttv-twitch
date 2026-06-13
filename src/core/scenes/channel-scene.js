/*!
 * core/scenes/channel-scene.js — the player + quality/info overlay.
 *
 * Rebuilt from the original SceneChannel.js. The big change: this scene knows
 * nothing about HLS players. It asks TW.api for a usher master URL, hands it to
 * the platform player adapter, and drives quality through a uniform
 * player.getQualities()/selectQuality() contract — so the same scene works
 * with hls.js (harness), AVPlay (Tizen) and INFOLINK (Orsay).
 *
 * Player adapter contract (adapter.createPlayer(callbacks) returns):
 *   load(masterUrl)            start playback (auto quality)
 *   stop()                     stop + release
 *   destroy()                  tear down
 *   setDisplayArea(x,y,w,h)
 *   getQualities(cb)           cb(["Auto", "1080p60", ...]) when known
 *   selectQuality(index)       index into the getQualities() list
 * callbacks: onBufferingStart, onBufferingProgress(pct), onBufferingComplete,
 *            onPlaying, onError(msg), onEnded
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var dom = TW.dom;
  var KEY = TW.KEY;

  function ChannelScene(adapter) {
    this.adapter = adapter;
    this.player = null;
    this.login = null;
    this.qualities = ['Auto'];
    this.qualityIndex = 0;     // highlighted in the panel
    this.playingIndex = 0;     // currently playing
    this.panelShown = false;
    this.infoTimer = null;
  }

  var P = ChannelScene.prototype;

  P.initialize = function () {
    var root = dom.create('div', 'tw-scene', '');
    root.id = 'tw-channel';
    root.innerHTML =
      '<div class="tw-panel" id="tw-panel">' +
        '<img class="tw-panel-logo" src="assets/logo.png" alt="">' +
        '<div class="tw-panel-head">' +
          '<img class="tw-panel-icon" id="tw-c-icon" src="">' +
          '<div class="tw-panel-name" id="tw-c-name"></div>' +
          '<div class="tw-panel-viewers" id="tw-c-viewers"></div>' +
        '</div>' +
        '<div class="tw-panel-title" id="tw-c-title"></div>' +
        '<div class="tw-panel-quality">' +
          '<span id="tw-c-quality-label"></span>' +
          '<span class="tw-quality-name" id="tw-c-quality"></span>' +
          '<span class="tw-quality-arrows"><i id="tw-c-up">&#9650;</i><i id="tw-c-down">&#9660;</i></span>' +
        '</div>' +
      '</div>' +
      '<div class="tw-loading" id="tw-c-loading"><div class="tw-spinner"><i></i><i></i><i></i></div>' +
        '<div class="tw-loading-text" id="tw-c-loading-text"></div></div>';
    (dom.get('app') || global.document.body).appendChild(root);
    this.root = root;
    dom.text(dom.get('tw-c-quality-label'), TW.i18n.t('QUALITY'));
  };

  P.handleShow = function (data) {
    this.login = data && data.login;
    dom.show(this.root);
  };

  P.handleFocus = function () {
    var self = this;
    if (this.adapter.system && this.adapter.system.setScreensaver) {
      this.adapter.system.setScreensaver(true, 100000);
    }
    this.hidePanel();
    dom.text(dom.get('tw-c-name'), this.login || '');
    dom.text(dom.get('tw-c-title'), '');
    dom.text(dom.get('tw-c-viewers'), '');
    dom.attr(dom.get('tw-c-icon'), 'src', '');
    this.showDialog(TW.i18n.t('LOADING'));

    this.player = this.adapter.createPlayer(this.playerCallbacks());
    if (this.player.setDisplayArea) {
      this.player.setDisplayArea(0, 0, TW.config.screen.width, TW.config.screen.height);
    }

    TW.api.playbackUrl(this.login, function (masterUrl) {
      self.player.load(masterUrl);
      self.player.getQualities(function (list) {
        self.qualities = (list && list.length) ? list : ['Auto'];
        self.qualityIndex = 0; self.playingIndex = 0;
        self.renderQuality();
      });
    }, function () {
      self.showDialog(TW.i18n.t('ERROR_TOKEN'));
    });

    this.updateInfo();
    this.infoTimer = global.setInterval(function () { self.updateInfo(); }, 10000);
  };

  P.handleBlur = function () {
    if (this.adapter.system && this.adapter.system.setScreensaver) {
      this.adapter.system.setScreensaver(false);
    }
  };

  P.handleHide = function () {
    if (this.infoTimer) { global.clearInterval(this.infoTimer); this.infoTimer = null; }
    if (this.player) { try { this.player.stop(); this.player.destroy(); } catch (e) {} this.player = null; }
    dom.hide(this.root);
  };

  P.playerCallbacks = function () {
    var self = this;
    return {
      onBufferingStart: function () { self.showDialog(TW.i18n.t('BUFFERING')); },
      onBufferingProgress: function (pct) { self.showDialog(TW.i18n.t('BUFFERING') + ': ' + pct + '%'); },
      onBufferingComplete: function () { self.hideDialog(); },
      onPlaying: function () { self.hideDialog(); },
      onEnded: function () { self.shutdown(); },
      onError: function (msg) { self.showDialog(msg || TW.i18n.t('ERROR_RENDER')); }
    };
  };

  // --- overlay ------------------------------------------------------------
  P.showDialog = function (text) {
    dom.text(dom.get('tw-c-loading-text'), text || '');
    dom.show(dom.get('tw-c-loading'));
  };
  P.hideDialog = function () { dom.hide(dom.get('tw-c-loading')); };

  P.updateInfo = function () {
    if (!this.login) { return; }
    TW.api.streamInfo(this.login, function (info) {
      dom.text(dom.get('tw-c-name'), info.display);
      dom.text(dom.get('tw-c-title'), info.title);
      dom.text(dom.get('tw-c-viewers'),
        info.online ? (TW.addCommas(info.viewers) + ' ' + TW.i18n.t('VIEWERS')) : '');
      if (info.logo) { dom.attr(dom.get('tw-c-icon'), 'src', info.logo); }
    }, TW.noop);
  };

  P.renderQuality = function () {
    var i = this.qualityIndex, n = this.qualities.length;
    dom.get('tw-c-up').style.opacity = i > 0 ? '1' : '0.2';
    dom.get('tw-c-down').style.opacity = i < n - 1 ? '1' : '0.2';
    dom.text(dom.get('tw-c-quality'), this.qualities[i]);
  };

  P.showPanel = function () { this.qualityIndex = this.playingIndex; this.renderQuality(); dom.show(dom.get('tw-panel')); this.panelShown = true; };
  P.hidePanel = function () { dom.hide(dom.get('tw-panel')); this.panelShown = false; };

  P.applyQuality = function () {
    this.playingIndex = this.qualityIndex;
    if (this.player.selectQuality) { this.player.selectQuality(this.qualityIndex); }
    this.hidePanel();
    // No forced spinner here: a platform that re-buffers on a quality switch
    // (Orsay re-plays the variant URL) drives the spinner via its own
    // onBufferingStart/Complete callbacks; hls.js and AVPlay switch seamlessly.
  };

  P.shutdown = function () { TW.app.goToBrowser(); };

  // --- keys ---------------------------------------------------------------
  P.handleKeyDown = function (key) {
    switch (key) {
      case KEY.BACK:
        if (this.panelShown) { this.hidePanel(); } else { this.shutdown(); }
        return true;
      case KEY.LEFT:
        this.showPanel(); return true;
      case KEY.RIGHT:
        this.hidePanel(); return true;
      case KEY.ENTER:
        if (this.panelShown) { this.applyQuality(); } else { this.showPanel(); }
        return true;
      case KEY.CH_UP: case KEY.N1:
        if (this.panelShown && this.qualityIndex > 0) { this.qualityIndex--; this.renderQuality(); }
        return true;
      case KEY.CH_DOWN: case KEY.N4:
        if (this.panelShown && this.qualityIndex < this.qualities.length - 1) { this.qualityIndex++; this.renderQuality(); }
        return true;
      default:
        return false;
    }
  };

  TW.ChannelScene = ChannelScene;
})(this);
