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
 *   load(masterUrl, meta)      start playback (auto quality); meta is optional
 *   stop()                     stop + release
 *   destroy()                  tear down
 *   setDisplayArea(x,y,w,h)
 *   getQualities(cb)           cb(["Auto", "1080p60", ...]) when known
 *   selectQuality(index)       index into the getQualities() list
 *   canSeek()                  optional; true when exact seeking is supported
 *   getPosition()              optional; seconds
 *   getDuration()              optional; seconds
 *   seekTo(seconds)            optional; exact seek for VOD/clip playback
 *   commitSeek()               optional; flush a pending/debounced seek
 *   pause()/resume()           optional; VOD/clip pause toggle
 * callbacks: onBufferingStart, onBufferingProgress(pct), onBufferingComplete,
 *            onPlaying, onError(msg), onEnded
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var dom = TW.dom;
  var KEY = TW.KEY;
  var CHAT_WIDTH = 360;
  var PANEL_WIDTH = 318;
  var PANEL_HEIGHT = 184;
  var PANEL_MARGIN = 24;
  var PANEL_GAP = 16;
  var OVERLAY_HIDE_MS = 3000;
  var OVERLAY_BACK_GRACE_MS = 1000;
  var SEEK_ACCEL_WINDOW_MS = 650;
  var SEEK_COMMIT_IDLE_MS = 650;
  var SEEK_STEPS = [10, 20, 30, 60, 120];

  function ChannelScene(adapter) {
    this.adapter = adapter;
    this.player = null;
    this.login = null;
    this.qualities = ['Auto'];
    this.qualityIndex = 0;     // highlighted in the panel
    this.playingIndex = 0;     // currently playing
    this.panelShown = false;
    this.infoTimer = null;
    this.startItem = null;
    this.overlayShown = true;
    this.overlayTimer = null;
    this.overlayBackGrace = false;
    this.overlayGraceTimer = null;
    this.overlayFocus = 'buttons'; // 'seek' | 'buttons'
    this.seekKey = null;
    this.seekRepeat = 0;
    this.seekLastAt = 0;
    this.seekFlashTimer = null;
    this.seekCommitTimer = null;
    this.pendingSeekPosition = null;
    this.paused = false;

    this.contentKind = 'live'; // 'live' | 'vod' | 'clip'
    this.startVod = null;      // if set on entry, play this VOD instead of live
    this.liveItem = null;      // selected live tile metadata, if available
    this.returnTo = null;      // where BACK exits to ('channelPage' | default browser)
    this.chatOn = false;
    this.chatClient = null;
    this.chatCount = 0;
    this.chatMessages = [];
    this.chatViewerText = '';
    this.liveOnline = true;

    this.controlIndex = 0;
    this.progressTimer = null;
    this.duration = 0;
  }

  // Keep a small recent chat history. While the rail is closed this is memory
  // only; when open, the same cap bounds DOM rows so video playback stays cheap.
  var CHAT_MAX = 40;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function formatDuration(sec) {
    sec = Math.floor(sec || 0);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? (h + ':' + pad2(m) + ':' + pad2(s)) : (m + ':' + pad2(s));
  }

  var P = ChannelScene.prototype;

  P.initialize = function () {
    var root = dom.create('div', 'tw-scene', '');
    root.id = 'tw-channel';
    root.innerHTML =
      '<div class="tw-player-surface" id="tw-player-surface">' +
        '<div class="tw-player-scrim tw-player-scrim-bottom" id="tw-player-scrim"></div>' +
        '<div class="tw-nowbar" id="tw-nowbar">' +
          '<img class="tw-now-icon" id="tw-c-icon" src="assets/icon/icon_85_70.png" alt="">' +
          '<div class="tw-now-copy">' +
            '<div class="tw-now-kicker">' +
              '<span class="tw-now-kind" id="tw-c-kind"></span>' +
              '<span class="tw-now-sep"></span>' +
              '<span class="tw-now-viewers" id="tw-c-viewers"></span>' +
            '</div>' +
            '<div class="tw-now-headline">' +
              '<span class="tw-now-name" id="tw-c-name"></span>' +
              '<span class="tw-now-game" id="tw-c-game"></span>' +
            '</div>' +
            '<div class="tw-now-title" id="tw-c-title"></div>' +
          '</div>' +
        '</div>' +
        '<div class="tw-progress" id="tw-progress">' +
          '<span class="tw-progress-time" id="tw-c-position"></span>' +
          '<span class="tw-progress-track"><span class="tw-progress-fill" id="tw-c-progress-fill"></span></span>' +
          '<span class="tw-progress-time tw-progress-total" id="tw-c-duration"></span>' +
        '</div>' +
        '<div class="tw-seek-flash" id="tw-seek-flash"></div>' +
        '<div class="tw-pause-indicator" id="tw-pause-indicator"><span></span><span></span></div>' +
        '<div class="tw-controls" id="tw-controls">' +
          '<span class="tw-control" id="tw-ctl-back">-10s</span>' +
          '<span class="tw-control" id="tw-ctl-forward">+10s</span>' +
          '<span class="tw-control" id="tw-ctl-channel"></span>' +
          '<span class="tw-control" id="tw-ctl-chat"></span>' +
          '<span class="tw-control" id="tw-ctl-quality"></span>' +
        '</div>' +
        '<div class="tw-panel" id="tw-panel">' +
          '<div class="tw-panel-mark"></div>' +
          '<div class="tw-panel-quality">' +
            '<div class="tw-quality-label" id="tw-c-quality-label"></div>' +
            '<div class="tw-quality-picker">' +
              '<span class="tw-quality-arrow" id="tw-c-up">&#9650;</span>' +
              '<span class="tw-quality-name" id="tw-c-quality"></span>' +
              '<span class="tw-quality-arrow" id="tw-c-down">&#9660;</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tw-loading" id="tw-c-loading"><div class="tw-status-box">' +
          '<div class="tw-spinner"></div><div class="tw-loading-text" id="tw-c-loading-text"></div>' +
        '</div></div>' +
      '</div>' +
      '<div class="tw-chat" id="tw-chat">' +
        '<div class="tw-chat-head" id="tw-chat-head">' +
          '<div class="tw-chat-avatar-wrap">' +
            '<img class="tw-chat-avatar" id="tw-chat-avatar" src="assets/icon/icon_85_70.png" alt="">' +
            '<span class="tw-chat-live-badge" id="tw-chat-live-badge"></span>' +
          '</div>' +
          '<div class="tw-chat-copy">' +
            '<div class="tw-chat-name" id="tw-chat-name"></div>' +
            '<div class="tw-chat-viewers" id="tw-chat-viewers">' +
              '<span class="tw-chat-viewer-number" id="tw-chat-viewer-number"></span>' +
              '<span class="tw-chat-viewer-label" id="tw-chat-viewer-label"></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tw-chat-list" id="tw-chat-list"></div>' +
      '</div>';
    (dom.get('app') || global.document.body).appendChild(root);
    this.root = root;
    dom.text(dom.get('tw-c-quality-label'), TW.i18n.t('QUALITY'));
    dom.text(dom.get('tw-c-kind'), TW.i18n.t('LIVE'));
    dom.text(dom.get('tw-c-game'), '');
    dom.text(dom.get('tw-ctl-channel'), TW.i18n.t('CHANNEL'));
    dom.text(dom.get('tw-ctl-chat'), TW.i18n.t('CHAT'));
    dom.text(dom.get('tw-ctl-quality'), TW.i18n.t('QUALITY'));
    this.setChatLiveBadge(true);
    dom.text(dom.get('tw-c-position'), '0:00');
    dom.text(dom.get('tw-c-duration'), '0:00');
    this.setChatChannel('', '');
    this.setChatViewers(null);
    this.applyPlayerLayout();
    this.refreshControls();
  };

  P.handleShow = function (data) {
    this.login = data && data.login;
    this.startVod = (data && data.vod) || null;   // play this VOD instead of live
    this.startItem = (data && data.item) || null;
    this.liveItem = (data && data.stream) || null;
    this.returnTo = (data && data.from) || null;   // e.g. 'channelPage'
    dom.show(this.root);
  };

  P.handleFocus = function () {
    if (this.adapter.system && this.adapter.system.setScreensaver) {
      this.adapter.system.setScreensaver(true, 100000);
    }
    this.hidePanel();
    this.closeChat();

    this.player = this.adapter.createPlayer(this.playerCallbacks());
    this.applyPlayerLayout();
    this.showOverlay();
    // Entered from the channel page on a specific VOD? Play it; otherwise live.
    if (this.startVod) {
      var v = this.startVod;
      this.startVod = null;
      this.startItem = null;
      this.playVod(v);
    } else if (this.startItem) {
      var item = this.startItem;
      this.startItem = null;
      if (item.kind === 'vod') { this.playVod(item); }
      else { this.playClip(item); }
    } else {
      this.playLive();
    }
  };

  // --- content sources ----------------------------------------------------
  P.playLive = function () {
    var self = this;
    this.contentKind = 'live';
    this.duration = 0;
    this.paused = false;
    this.hidePauseIndicator();
    this.overlayFocus = 'buttons';
    this.stopProgressTimer();
    this.clearPendingSeek();
    this.resetSeekAcceleration();
    this.liveOnline = true;
    this.setContentBadge('LIVE');
    this.setChatLiveBadge(true);
    var displayName = (this.liveItem && this.liveItem.display) || this.login || '';
    dom.text(dom.get('tw-c-name'), displayName);
    dom.text(dom.get('tw-c-title'), (this.liveItem && this.liveItem.title) || '');
    this.setGame((this.liveItem && this.liveItem.game) || '');
    var viewerCount = (this.liveItem && this.liveItem.viewers != null) ? this.liveItem.viewers : null;
    var viewerText = viewerCount != null ? this.formatViewerCount(viewerCount) : '';
    this.setViewers(viewerText);
    this.setChatChannel(displayName, '');
    this.setChatViewers(viewerCount);
    dom.attr(dom.get('tw-c-icon'), 'src', 'assets/icon/icon_85_70.png');
    this.refreshControls();
    this.resetChat();
    this.startChatCapture();
    this.showLoading();

    TW.api.playbackUrl(this.login, function (masterUrl) {
      self.loadInto(masterUrl, { kind: 'live', login: self.login });
    }, function () {
      self.showError(TW.i18n.t('ERROR_TOKEN'));
    });

    this.stopInfoTimer();
    this.updateInfo();
    this.infoTimer = global.setInterval(function () { self.updateInfo(); }, 10000);
  };

  // Hand a media URL (live master, VOD master, or clip MP4) to the player and
  // refresh the quality list. The player adapters detect HLS vs progressive.
  P.loadInto = function (url, meta) {
    var self = this;
    this.clearPendingSeek();
    try { this.player.stop(); } catch (e) {}
    this.player.load(url, meta || null);
    this.player.getQualities(function (list) {
      self.qualities = (list && list.length) ? list : ['Auto'];
      self.qualityIndex = 0; self.playingIndex = 0;
      self.renderQuality();
    });
  };

  P.stopInfoTimer = function () {
    if (this.infoTimer) { global.clearInterval(this.infoTimer); this.infoTimer = null; }
  };

  P.showContentInfo = function (item) {
    this.setContentBadge(item.kind === 'vod' ? 'VODS' : 'CLIPS');
    this.paused = false;
    this.hidePauseIndicator();
    this.overlayFocus = 'seek';
    dom.text(dom.get('tw-c-name'), this.login || '');
    dom.text(dom.get('tw-c-title'), item.title || '');
    this.setGame('');
    this.setViewers(TW.addCommas(item.viewers) + ' ' + TW.i18n.t('VIEWERS'));
    this.duration = item.duration || 0;
    this.clearPendingSeek();
    this.resetSeekAcceleration();
    this.refreshControls();
    this.updateProgress();
  };

  P.setContentBadge = function (key) {
    var root = this.root;
    if (root) {
      dom.removeClass(root, 'tw-content-live');
      dom.removeClass(root, 'tw-content-vods');
      dom.removeClass(root, 'tw-content-clips');
      if (key) { dom.addClass(root, 'tw-content-' + String(key).toLowerCase()); }
    }
    if (!key) {
      dom.text(dom.get('tw-c-kind'), '');
      dom.hide(dom.get('tw-c-kind'));
      return;
    }
    dom.text(dom.get('tw-c-kind'), TW.i18n.t(key));
    dom.show(dom.get('tw-c-kind'), 'inline-block');
  };

  P.setViewers = function (text) {
    dom.text(dom.get('tw-c-viewers'), text || '');
    if (!this.root) { return; }
    if (text) { dom.addClass(this.root, 'tw-has-viewers'); }
    else { dom.removeClass(this.root, 'tw-has-viewers'); }
  };

  P.formatViewerCount = function (count) {
    return TW.addCommas(count || 0) + ' ' + TW.i18n.t('VIEWERS');
  };

  P.setChatChannel = function (name, logo) {
    dom.text(dom.get('tw-chat-name'), name || this.login || '');
    dom.attr(dom.get('tw-chat-avatar'), 'src', logo || 'assets/icon/icon_85_70.png');
  };

  P.setChatViewers = function (count) {
    var hasCount = count != null;
    var numberText = hasCount ? TW.addCommas(count) : '';
    var labelText = hasCount ? TW.i18n.t('VIEWERS') : '';
    this.chatViewerText = hasCount ? (numberText + ' ' + labelText) : '';
    dom.text(dom.get('tw-chat-viewer-number'), numberText);
    dom.text(dom.get('tw-chat-viewer-label'), hasCount ? (' ' + labelText) : '');
    if (!this.root) { return; }
    if (this.chatViewerText) { dom.addClass(this.root, 'tw-chat-has-viewers'); }
    else { dom.removeClass(this.root, 'tw-chat-has-viewers'); }
  };

  P.setChatLiveBadge = function (online) {
    var badge = dom.get('tw-chat-live-badge');
    if (online) {
      dom.text(badge, TW.i18n.t('LIVE'));
      dom.show(badge, 'inline-block');
    } else {
      dom.text(badge, '');
      dom.hide(badge);
    }
  };

  P.setLiveOnline = function (online) {
    this.liveOnline = online;
    if (online) {
      this.setContentBadge('LIVE');
      this.setChatLiveBadge(true);
      this.startChatCapture();
    } else {
      this.setContentBadge(null);
      this.setChatLiveBadge(false);
      if (this.chatOn) { this.closeChat(); }
      this.stopChatCapture();
      this.resetChat();
    }
    this.refreshControls();
  };

  P.setGame = function (text) {
    dom.text(dom.get('tw-c-game'), text || '');
    if (!this.root) { return; }
    if (text) { dom.addClass(this.root, 'tw-has-game'); }
    else { dom.removeClass(this.root, 'tw-has-game'); }
  };

  P.playVod = function (item) {
    var self = this;
    this.contentKind = 'vod';
    this.closeChat();
    this.stopChatCapture();
    this.resetChat();
    this.stopInfoTimer();
    this.showContentInfo(item);
    this.startProgressTimer();
    this.showLoading();
    TW.api.vodPlaybackUrl(item.id, function (url) {
      self.loadInto(url, item);
    }, function () { self.showError(TW.i18n.t('ERROR_TOKEN')); });
  };

  P.playClip = function (item) {
    var self = this;
    this.contentKind = 'clip';
    this.closeChat();
    this.stopChatCapture();
    this.resetChat();
    this.stopInfoTimer();
    this.showContentInfo(item);
    this.startProgressTimer();
    this.showLoading();
    TW.api.clipPlayback(item.slug, function (info) {
      self.loadInto(info.url, item);
    }, function () { self.showError(TW.i18n.t('ERROR_RENDER')); });
  };

  P.handleBlur = function () {
    if (this.adapter.system && this.adapter.system.setScreensaver) {
      this.adapter.system.setScreensaver(false);
    }
  };

  P.handleHide = function () {
    this.stopInfoTimer();
    this.stopProgressTimer();
    this.clearOverlayTimer();
    this.clearOverlayGrace();
    this.hideSeekFlash();
    this.hidePauseIndicator();
    this.clearPendingSeek();
    this.closeChat();
    this.stopChatCapture();
    if (this.player) { try { this.player.stop(); this.player.destroy(); } catch (e) {} this.player = null; }
    dom.hide(this.root);
  };

  P.playerCallbacks = function () {
    var self = this;
    return {
      onBufferingStart: function () { self.showBuffering(TW.i18n.t('BUFFERING')); },
      onBufferingProgress: function (pct) { self.showBuffering(TW.i18n.t('BUFFERING') + ': ' + pct + '%'); },
      onBufferingComplete: function () { self.hideDialog(); },
      onPlaying: function () { self.paused = false; self.hidePauseIndicator(); self.hideDialog(); self.updateProgress(); },
      onEnded: function () { self.onContentEnded(); },
      onError: function (msg) { self.showError(msg || TW.i18n.t('ERROR_RENDER')); }
    };
  };

  // --- overlay ------------------------------------------------------------
  P.showPauseIndicator = function () {
    dom.show(dom.get('tw-pause-indicator'));
  };

  P.hidePauseIndicator = function () {
    dom.hide(dom.get('tw-pause-indicator'));
  };

  P.syncPauseIndicator = function () {
    if (this.paused) { this.showPauseIndicator(); }
    else { this.hidePauseIndicator(); }
  };

  // Indeterminate loading: status tile with spinner only.
  P.showLoading = function () {
    var el = dom.get('tw-c-loading');
    dom.text(dom.get('tw-c-loading-text'), '');
    dom.removeClass(el, 'tw-msg');
    dom.removeClass(el, 'tw-error');
    dom.show(el);
    this.hidePauseIndicator();
  };

  // Buffering remains a player state: spinner plus short status text.
  P.showBuffering = function (text) {
    var el = dom.get('tw-c-loading');
    dom.text(dom.get('tw-c-loading-text'), text || '');
    dom.addClass(el, 'tw-msg');
    dom.removeClass(el, 'tw-error');
    dom.show(el);
    this.hidePauseIndicator();
  };

  // Error/status dialog: message only.
  P.showError = function (text) {
    var el = dom.get('tw-c-loading');
    dom.text(dom.get('tw-c-loading-text'), text || '');
    dom.addClass(el, 'tw-msg');
    dom.addClass(el, 'tw-error');
    dom.show(el);
    this.hidePauseIndicator();
  };

  P.showDialog = function (text) {
    this.showError(text);
  };

  P.hideDialog = function () {
    dom.hide(dom.get('tw-c-loading'));
    this.syncPauseIndicator();
  };

  P.updateInfo = function () {
    var self = this;
    if (!this.login || this.contentKind !== 'live') { return; }
    TW.api.streamInfo(this.login, function (info) {
      var online = !!info.online;
      dom.text(dom.get('tw-c-name'), info.display);
      dom.text(dom.get('tw-c-title'), info.title);
      self.setGame(info.game || '');
      self.setLiveOnline(online);
      var viewerCount = online ? info.viewers : null;
      var viewerText = viewerCount != null ? self.formatViewerCount(viewerCount) : '';
      self.setViewers(viewerText);
      self.setChatChannel(info.display, info.logo);
      self.setChatViewers(viewerCount);
      if (info.logo) { dom.attr(dom.get('tw-c-icon'), 'src', info.logo); }
    }, TW.noop);
  };

  P.renderQuality = function () {
    var i = this.qualityIndex, n = this.qualities.length;
    dom.get('tw-c-up').style.opacity = i > 0 ? '1' : '0.2';
    dom.get('tw-c-down').style.opacity = i < n - 1 ? '1' : '0.2';
    dom.text(dom.get('tw-c-quality'), this.qualities[i]);
  };

  P.clearOverlayTimer = function () {
    if (this.overlayTimer) { global.clearTimeout(this.overlayTimer); this.overlayTimer = null; }
  };

  P.clearOverlayGrace = function () {
    if (this.overlayGraceTimer) { global.clearTimeout(this.overlayGraceTimer); this.overlayGraceTimer = null; }
    this.overlayBackGrace = false;
  };

  P.startOverlayGrace = function () {
    var self = this;
    this.clearOverlayGrace();
    this.overlayBackGrace = true;
    this.overlayGraceTimer = global.setTimeout(function () {
      self.overlayBackGrace = false;
      self.overlayGraceTimer = null;
    }, OVERLAY_BACK_GRACE_MS);
  };

  P.startOverlayTimer = function () {
    var self = this;
    this.clearOverlayTimer();
    if (!this.overlayShown) { return; }
    this.overlayTimer = global.setTimeout(function () { self.hideOverlay(true); }, OVERLAY_HIDE_MS);
  };

  P.showOverlay = function () {
    this.overlayShown = true;
    this.clearOverlayGrace();
    this.hideSeekFlash();
    if (!this.canSeek()) { this.overlayFocus = 'buttons'; }
    else if (this.overlayFocus !== 'buttons') { this.overlayFocus = 'seek'; }
    dom.show(dom.get('tw-player-scrim'));
    dom.show(dom.get('tw-nowbar'));
    dom.show(dom.get('tw-controls'));
    this.refreshControls();
    this.startOverlayTimer();
  };

  P.hideOverlay = function (auto) {
    this.clearOverlayTimer();
    this.hidePanel();
    this.overlayShown = false;
    dom.hide(dom.get('tw-player-scrim'));
    dom.hide(dom.get('tw-nowbar'));
    dom.hide(dom.get('tw-controls'));
    dom.hide(dom.get('tw-progress'));
    if (auto) { this.startOverlayGrace(); }
    else { this.clearOverlayGrace(); }
  };

  P.noteOverlayActivity = function () {
    if (!this.overlayShown) { this.showOverlay(); }
    else { this.startOverlayTimer(); }
  };

  P.hideSeekFlash = function () {
    if (this.seekFlashTimer) { global.clearTimeout(this.seekFlashTimer); this.seekFlashTimer = null; }
    dom.hide(dom.get('tw-seek-flash'));
  };

  P.showSeekFlash = function (seconds) {
    var el = dom.get('tw-seek-flash');
    var self = this;
    if (!el) { return; }
    if (this.seekFlashTimer) { global.clearTimeout(this.seekFlashTimer); this.seekFlashTimer = null; }
    dom.removeClass(el, 'tw-seek-flash-left');
    dom.removeClass(el, 'tw-seek-flash-right');
    dom.addClass(el, seconds < 0 ? 'tw-seek-flash-left' : 'tw-seek-flash-right');
    dom.text(el, (seconds < 0 ? '' : '+') + seconds + 's');
    dom.show(el);
    this.seekFlashTimer = global.setTimeout(function () {
      dom.hide(el);
      self.seekFlashTimer = null;
    }, 650);
  };

  function intPx(v) {
    var n = parseInt(v, 10);
    return n === n ? n : 0;
  }

  function offsetWithin(el, root, prop) {
    var value = 0, guard = 0;
    while (el && el !== root && guard < 12) {
      value += el[prop] || 0;
      el = el.offsetParent;
      guard++;
    }
    return value;
  }

  P.positionQualityPanel = function () {
    var panel = dom.get('tw-panel');
    var button = dom.get('tw-ctl-quality');
    var surface = dom.get('tw-player-surface');
    if (!panel || !button || !surface) { return; }

    var surfaceW = surface.offsetWidth || intPx(surface.style.width) || TW.config.screen.width;
    var surfaceH = surface.offsetHeight || intPx(surface.style.height) || TW.config.screen.height;
    var panelW = panel.offsetWidth || PANEL_WIDTH;
    var panelH = panel.offsetHeight || PANEL_HEIGHT;
    var buttonLeft = offsetWithin(button, surface, 'offsetLeft');
    var buttonTop = offsetWithin(button, surface, 'offsetTop') || (surfaceH - 72);
    var buttonW = button.offsetWidth || 0;

    var left = buttonLeft + Math.floor(buttonW / 2) - Math.floor(panelW / 2);
    var maxLeft = surfaceW - panelW - PANEL_MARGIN;
    if (left < PANEL_MARGIN) { left = PANEL_MARGIN; }
    if (left > maxLeft) { left = maxLeft; }
    if (left < 0) { left = 0; }

    var bottom = surfaceH - buttonTop + PANEL_GAP;
    if (this.canSeek()) { bottom += 34; } // keep clear of the VOD progress bar
    if (bottom + panelH + PANEL_MARGIN > surfaceH) { bottom = surfaceH - panelH - PANEL_MARGIN; }
    if (bottom < PANEL_MARGIN) { bottom = PANEL_MARGIN; }

    panel.style.left = left + 'px';
    panel.style.bottom = bottom + 'px';
  };

  P.showPanel = function () {
    this.showOverlay();
    this.qualityIndex = this.playingIndex;
    this.renderQuality();
    this.positionQualityPanel();
    dom.show(dom.get('tw-panel'));
    this.panelShown = true;
  };
  P.hidePanel = function () { dom.hide(dom.get('tw-panel')); this.panelShown = false; };

  P.applyQuality = function () {
    this.playingIndex = this.qualityIndex;
    if (this.player.selectQuality) { this.player.selectQuality(this.qualityIndex); }
    this.hidePanel();
    this.startOverlayTimer();
    // No forced spinner here: a platform that re-buffers on a quality switch
    // (Orsay re-plays the variant URL) drives the spinner via its own
    // onBufferingStart/Complete callbacks; hls.js and AVPlay switch seamlessly.
  };

  // --- chat rail (read-only, live only) -----------------------------------
  P.playerRect = function () {
    var sw = TW.config.screen.width, sh = TW.config.screen.height;
    if (!this.chatOn) { return { x: 0, y: 0, w: sw, h: sh }; }

    var chatW = Math.min(CHAT_WIDTH, Math.floor(sw * 0.4));
    var availW = sw - chatW, availH = sh;
    var w = availW;
    var h = Math.round(w * sh / sw);
    if (h > availH) {
      h = availH;
      w = Math.round(h * sw / sh);
    }
    return {
      x: Math.floor((availW - w) / 2),
      y: Math.floor((availH - h) / 2),
      w: w,
      h: h
    };
  };

  P.applyPlayerLayout = function () {
    var r = this.playerRect();
    var surface = dom.get('tw-player-surface');
    var chat = dom.get('tw-chat');
    if (surface) {
      surface.style.left = r.x + 'px';
      surface.style.top = r.y + 'px';
      surface.style.width = r.w + 'px';
      surface.style.height = r.h + 'px';
    }
    if (chat) {
      var chatW = Math.min(CHAT_WIDTH, Math.floor(TW.config.screen.width * 0.4));
      chat.style.left = (TW.config.screen.width - chatW) + 'px';
      chat.style.width = chatW + 'px';
    }
    if (this.player && this.player.setDisplayArea) { this.player.setDisplayArea(r.x, r.y, r.w, r.h); }
    if (this.panelShown) { this.positionQualityPanel(); }
  };

  P.toggleChat = function () {
    if (this.contentKind !== 'live' || this.liveOnline === false) { return; }
    if (this.chatOn) { this.closeChat(); } else { this.openChat(); }
  };

  P.openChat = function () {
    if (this.chatOn || !this.login || this.liveOnline === false) { return; }
    this.chatOn = true;
    dom.addClass(this.root, 'tw-chat-open');
    dom.show(dom.get('tw-chat'));
    this.applyPlayerLayout();
    this.renderChatMessages();
    this.startChatCapture();
  };

  P.closeChat = function () {
    this.chatOn = false;
    if (this.root) { dom.removeClass(this.root, 'tw-chat-open'); }
    dom.hide(dom.get('tw-chat'));
    this.applyPlayerLayout();
    this.clearChat();
  };

  P.clearChat = function () { this.chatCount = 0; dom.html(dom.get('tw-chat-list'), ''); };

  P.resetChat = function () {
    this.chatMessages = [];
    this.clearChat();
  };

  P.startChatCapture = function () {
    if (this.chatClient || !this.login || this.contentKind !== 'live') { return; }
    var self = this;
    this.chatClient = TW.twitch.chat.connect(this.login, {
      onMessage: function (m) { self.addChatMessage(m); },
      onError: function () {}
    });
  };

  P.stopChatCapture = function () {
    if (this.chatClient) { try { this.chatClient.close(); } catch (e) {} this.chatClient = null; }
  };

  P.addChatMessage = function (m) {
    this.chatMessages.push(m);
    while (this.chatMessages.length > CHAT_MAX) { this.chatMessages.shift(); }
    if (this.chatOn) { this.appendChatLine(m); }
  };

  P.renderChatMessages = function () {
    this.clearChat();
    for (var i = 0; i < this.chatMessages.length; i++) { this.appendChatLine(this.chatMessages[i]); }
  };

  P.appendChatLine = function (m) {
    var list = dom.get('tw-chat-list');
    if (!list) { return; }
    var color = /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : '#9b9bb0';
    var row = dom.create('div', 'tw-chat-row');
    row.innerHTML =
      '<b class="tw-chat-nick" style="color:' + color + '">' + dom.escape(m.nick) + '</b>' +
      '<span class="tw-chat-sep">: </span>' +
      '<span class="tw-chat-msg">' + dom.escape(m.text) + '</span>';
    list.appendChild(row);
    this.chatCount++;
    while (this.chatCount > CHAT_MAX && list.firstChild) { list.removeChild(list.firstChild); this.chatCount--; }
    list.scrollTop = list.scrollHeight;
  };

  // --- transport controls -------------------------------------------------
  P.canSeek = function () {
    if (this.contentKind === 'live' || !this.player || !this.player.seekTo) { return false; }
    if (this.player.canSeek) { return this.player.canSeek(); }
    return true;
  };

  P.startProgressTimer = function () {
    var self = this;
    this.stopProgressTimer();
    this.updateProgress();
    this.progressTimer = global.setInterval(function () { self.updateProgress(); }, 1000);
  };

  P.stopProgressTimer = function () {
    if (this.progressTimer) { global.clearInterval(this.progressTimer); this.progressTimer = null; }
  };

  P.updateProgress = function () {
    var pos = 0, dur = this.duration || 0;
    if (this.player && this.player.getPosition) {
      try { pos = this.player.getPosition() || 0; } catch (e) { pos = 0; }
    }
    if (this.pendingSeekPosition != null) { pos = this.pendingSeekPosition; }
    if (this.player && this.player.getDuration) {
      try { dur = this.player.getDuration() || dur; } catch (e2) {}
    }
    if (!(pos >= 0)) { pos = 0; }
    if (!(dur > 0)) { dur = this.duration || 0; }
    if (dur > 0 && pos > dur) { pos = dur; }

    dom.text(dom.get('tw-c-position'), formatDuration(pos));
    dom.text(dom.get('tw-c-duration'), dur > 0 ? formatDuration(dur) : '0:00');
    var fill = dom.get('tw-c-progress-fill');
    if (fill) { fill.style.width = dur > 0 ? (Math.round((pos / dur) * 1000) / 10) + '%' : '0%'; }
  };

  P.clearPendingSeek = function () {
    if (this.seekCommitTimer) { global.clearTimeout(this.seekCommitTimer); this.seekCommitTimer = null; }
    this.pendingSeekPosition = null;
  };

  P.scheduleSeekCommit = function () {
    var self = this;
    if (this.seekCommitTimer) { global.clearTimeout(this.seekCommitTimer); }
    this.seekCommitTimer = global.setTimeout(function () {
      self.seekCommitTimer = null;
      self.confirmSeek();
    }, SEEK_COMMIT_IDLE_MS);
  };

  P.seekBy = function (seconds) {
    if (!this.canSeek()) { return; }
    var pos = 0, dur = this.duration || 0;
    if (this.pendingSeekPosition != null) {
      pos = this.pendingSeekPosition;
    } else {
      try { if (this.player.getPosition) { pos = this.player.getPosition() || 0; } } catch (e) {}
    }
    try { if (this.player.getDuration) { dur = this.player.getDuration() || dur; } } catch (e2) {}
    var next = Math.max(0, pos + seconds);
    if (dur > 0 && next > dur) { next = dur; }
    this.pendingSeekPosition = next;
    this.scheduleSeekCommit();
    this.updateProgress();
  };

  P.confirmSeek = function () {
    if (!this.canSeek() || !this.player) { return; }
    if (this.seekCommitTimer) { global.clearTimeout(this.seekCommitTimer); this.seekCommitTimer = null; }
    var hasPending = this.pendingSeekPosition != null;
    var next = this.pendingSeekPosition;
    this.pendingSeekPosition = null;
    if (hasPending) { try { this.player.seekTo(next); } catch (e) {} }
    if (this.player.commitSeek) { try { this.player.commitSeek(); } catch (e2) {} }
    this.resetSeekAcceleration();
    this.updateProgress();
  };

  P.togglePlayback = function () {
    if (!this.canSeek() || !this.player) { return; }
    if (this.paused) {
      if (this.player.resume) { try { this.player.resume(); } catch (e) {} }
      this.paused = false;
    } else {
      if (this.player.pause) { try { this.player.pause(); } catch (e2) {} }
      this.paused = true;
    }
    this.syncPauseIndicator();
  };

  function nowMs() {
    if (global.Date && global.Date.now) { return global.Date.now(); }
    return (new Date()).getTime();
  }

  P.resetSeekAcceleration = function () {
    this.seekKey = null;
    this.seekRepeat = 0;
    this.seekLastAt = 0;
  };

  P.seekDeltaForKey = function (key) {
    var now = nowMs();
    if (this.seekKey === key && now - this.seekLastAt <= SEEK_ACCEL_WINDOW_MS) {
      this.seekRepeat++;
    } else {
      this.seekRepeat = 0;
    }
    this.seekKey = key;
    this.seekLastAt = now;
    var step = SEEK_STEPS[Math.min(this.seekRepeat, SEEK_STEPS.length - 1)];
    return key === KEY.LEFT ? -step : step;
  };

  P.handleSeekKey = function (key) {
    if (!this.canSeek() || (key !== KEY.LEFT && key !== KEY.RIGHT)) { return false; }
    if (!this.overlayShown) {
      this.clearOverlayGrace();
      this.resetSeekAcceleration();
      var fixed = key === KEY.LEFT ? -10 : 10;
      this.seekBy(fixed);
      this.showSeekFlash(fixed);
      return true;
    }
    if (this.overlayFocus !== 'seek') { return false; }
    this.noteOverlayActivity();
    this.seekBy(this.seekDeltaForKey(key));
    return true;
  };

  P.visibleControls = function () {
    var ids = [];
    ids.push('tw-ctl-channel');
    if (this.contentKind === 'live' && this.liveOnline !== false) { ids.push('tw-ctl-chat'); }
    ids.push('tw-ctl-quality');
    return ids;
  };

  P.refreshControls = function () {
    var all = ['tw-ctl-back', 'tw-ctl-forward', 'tw-ctl-channel', 'tw-ctl-chat', 'tw-ctl-quality'];
    var visible = this.visibleControls();
    var progress = dom.get('tw-progress');
    var i, el;
    for (i = 0; i < all.length; i++) {
      el = dom.get(all[i]);
      dom.removeClass(el, 'tw-focused');
      dom.hide(el);
    }
    dom.removeClass(progress, 'tw-focused');
    if (this.controlIndex >= visible.length) { this.controlIndex = visible.length - 1; }
    if (this.controlIndex < 0) { this.controlIndex = 0; }
    if (this.overlayShown) {
      dom.show(dom.get('tw-controls'));
      for (i = 0; i < visible.length; i++) { dom.show(dom.get(visible[i]), 'inline-block'); }
      if (this.canSeek()) {
        dom.show(progress, 'block');
        if (this.overlayFocus === 'seek') { dom.addClass(progress, 'tw-focused'); }
        else { dom.addClass(dom.get(visible[this.controlIndex]), 'tw-focused'); }
      } else {
        this.overlayFocus = 'buttons';
        dom.addClass(dom.get(visible[this.controlIndex]), 'tw-focused');
        dom.hide(progress);
      }
    } else {
      dom.hide(dom.get('tw-controls'));
      dom.hide(progress);
    }
    this.updateProgress();
  };

  P.moveControl = function (delta) {
    var visible = this.visibleControls();
    if (!visible.length) { return; }
    this.controlIndex += delta;
    if (this.controlIndex < 0) { this.controlIndex = 0; }
    if (this.controlIndex >= visible.length) { this.controlIndex = visible.length - 1; }
    this.refreshControls();
  };

  P.activateControl = function () {
    var visible = this.visibleControls();
    var id = visible[this.controlIndex];
    if (id === 'tw-ctl-back') { this.seekBy(-10); return; }
    if (id === 'tw-ctl-forward') { this.seekBy(10); return; }
    if (id === 'tw-ctl-channel') { this.openChannelPage(); return; }
    if (id === 'tw-ctl-chat') { this.toggleChat(); return; }
    if (id === 'tw-ctl-quality') { this.showPanel(); }
  };

  P.openChannelPage = function () {
    TW.app.goToChannelPage(this.login);
  };

  P.handlePanelKey = function (key) {
    if (key === KEY.BACK || key === KEY.LEFT || key === KEY.RIGHT) { this.hidePanel(); return true; }
    if ((key === KEY.UP || key === KEY.CH_UP || key === KEY.N1) && this.qualityIndex > 0) {
      this.qualityIndex--; this.renderQuality(); return true;
    }
    if ((key === KEY.DOWN || key === KEY.CH_DOWN || key === KEY.N4) && this.qualityIndex < this.qualities.length - 1) {
      this.qualityIndex++; this.renderQuality(); return true;
    }
    if (key === KEY.ENTER) { this.applyQuality(); return true; }
    return true;
  };

  P.onContentEnded = function () {
    this.shutdown();
  };

  P.shutdown = function () {
    // Came from a channel page (e.g. selected one of its VODs)? Return there.
    if (this.returnTo === 'channelPage' && this.login) { TW.app.goToChannelPage(this.login); }
    else { TW.app.goToBrowser(); }
  };

  // --- keys ---------------------------------------------------------------
  P.handleBackKey = function () {
    this.resetSeekAcceleration();
    if (this.panelShown) {
      this.hidePanel();
      this.startOverlayTimer();
      return true;
    }
    if (this.overlayShown) { this.hideOverlay(false); return true; }
    if (this.overlayBackGrace) { this.clearOverlayGrace(); return true; }
    if (this.chatOn) { this.closeChat(); }
    else { this.shutdown(); }
    return true;
  };

  P.handleKeyDown = function (key) {
    if (key === KEY.BACK) { return this.handleBackKey(); }
    if (this.panelShown) {
      this.resetSeekAcceleration();
      this.noteOverlayActivity();
      return this.handlePanelKey(key);
    }
    if (!this.overlayShown) {
      if (this.handleSeekKey(key)) { return true; }
      this.resetSeekAcceleration();
      this.overlayFocus = this.canSeek() ? 'seek' : 'buttons';
      this.showOverlay();
      if (key === KEY.ENTER && this.canSeek()) { this.togglePlayback(); }
      return true;
    }
    if (key === KEY.DOWN && this.overlayFocus === 'buttons') {
      this.resetSeekAcceleration();
      this.hideOverlay(false);
      return true;
    }
    if (this.canSeek() && (key === KEY.UP || key === KEY.DOWN)) {
      this.resetSeekAcceleration();
      this.noteOverlayActivity();
      this.overlayFocus = key === KEY.UP ? 'seek' : 'buttons';
      this.refreshControls();
      return true;
    }
    if (this.handleSeekKey(key)) { return true; }
    this.resetSeekAcceleration();
    this.noteOverlayActivity();
    if (this.canSeek() && this.overlayFocus === 'seek' && key === KEY.ENTER) {
      this.confirmSeek();
      return true;
    }
    switch (key) {
      case KEY.LEFT:
        this.moveControl(-1); return true;
      case KEY.RIGHT:
        this.moveControl(1); return true;
      case KEY.ENTER:
        this.activateControl();
        return true;
      default:
        return false;
    }
  };

  TW.ChannelScene = ChannelScene;
})(this);
