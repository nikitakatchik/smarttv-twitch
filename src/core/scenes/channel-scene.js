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
 *   canSeek()                  optional; true when exact seeking is supported
 *   getPosition()              optional; seconds
 *   getDuration()              optional; seconds
 *   seekTo(seconds)            optional; exact seek for VOD/clip playback
 * callbacks: onBufferingStart, onBufferingProgress(pct), onBufferingComplete,
 *            onPlaying, onError(msg), onEnded
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var dom = TW.dom;
  var KEY = TW.KEY;
  var CHAT_WIDTH = 360;

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

    this.contentKind = 'live'; // 'live' | 'vod' | 'clip'
    this.startVod = null;      // if set on entry, play this VOD instead of live
    this.returnTo = null;      // where BACK exits to ('channelPage' | default browser)
    this.chatOn = false;
    this.chatClient = null;
    this.chatCount = 0;
    this.chatMessages = [];

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
        '<div class="tw-player-scrim tw-player-scrim-bottom"></div>' +
        '<div class="tw-nowbar" id="tw-nowbar">' +
          '<img class="tw-now-icon" id="tw-c-icon" src="assets/icon/icon_85_70.png" alt="">' +
          '<div class="tw-now-copy">' +
            '<div class="tw-now-kicker">' +
              '<span class="tw-now-kind" id="tw-c-kind"></span>' +
              '<span class="tw-now-sep"></span>' +
              '<span class="tw-now-viewers" id="tw-c-viewers"></span>' +
            '</div>' +
            '<div class="tw-now-name" id="tw-c-name"></div>' +
            '<div class="tw-now-title" id="tw-c-title"></div>' +
          '</div>' +
        '</div>' +
        '<div class="tw-progress" id="tw-progress">' +
          '<span class="tw-progress-time" id="tw-c-position"></span>' +
          '<span class="tw-progress-track"><span class="tw-progress-fill" id="tw-c-progress-fill"></span></span>' +
          '<span class="tw-progress-time tw-progress-total" id="tw-c-duration"></span>' +
        '</div>' +
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
        '<div class="tw-loading" id="tw-c-loading"><div class="tw-spinner"></div>' +
          '<div class="tw-loading-text" id="tw-c-loading-text"></div></div>' +
      '</div>' +
      '<div class="tw-chat" id="tw-chat">' +
        '<div class="tw-chat-list" id="tw-chat-list"></div>' +
      '</div>';
    (dom.get('app') || global.document.body).appendChild(root);
    this.root = root;
    dom.text(dom.get('tw-c-quality-label'), TW.i18n.t('QUALITY'));
    dom.text(dom.get('tw-c-kind'), TW.i18n.t('LIVE'));
    dom.text(dom.get('tw-ctl-channel'), TW.i18n.t('CHANNEL'));
    dom.text(dom.get('tw-ctl-chat'), TW.i18n.t('CHAT'));
    dom.text(dom.get('tw-ctl-quality'), TW.i18n.t('QUALITY'));
    dom.text(dom.get('tw-c-position'), '0:00');
    dom.text(dom.get('tw-c-duration'), '0:00');
    this.applyPlayerLayout();
    this.refreshControls();
  };

  P.handleShow = function (data) {
    this.login = data && data.login;
    this.startVod = (data && data.vod) || null;   // play this VOD instead of live
    this.startItem = (data && data.item) || null;
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
    this.stopProgressTimer();
    this.setContentBadge('LIVE');
    dom.text(dom.get('tw-c-name'), this.login || '');
    dom.text(dom.get('tw-c-title'), '');
    this.setViewers('');
    dom.attr(dom.get('tw-c-icon'), 'src', 'assets/icon/icon_85_70.png');
    this.refreshControls();
    this.resetChat();
    this.startChatCapture();
    this.showLoading();

    TW.api.playbackUrl(this.login, function (masterUrl) {
      self.loadInto(masterUrl);
    }, function () {
      self.showDialog(TW.i18n.t('ERROR_TOKEN'));
    });

    this.stopInfoTimer();
    this.updateInfo();
    this.infoTimer = global.setInterval(function () { self.updateInfo(); }, 10000);
  };

  // Hand a media URL (live master, VOD master, or clip MP4) to the player and
  // refresh the quality list. The player adapters detect HLS vs progressive.
  P.loadInto = function (url) {
    var self = this;
    try { this.player.stop(); } catch (e) {}
    this.player.load(url);
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
    dom.text(dom.get('tw-c-name'), this.login || '');
    dom.text(dom.get('tw-c-title'), item.title || '');
    this.setViewers(TW.addCommas(item.viewers) + ' ' + TW.i18n.t('VIEWERS'));
    this.duration = item.duration || 0;
    this.refreshControls();
    this.updateProgress();
  };

  P.setContentBadge = function (key) {
    var root = this.root;
    if (root) {
      dom.removeClass(root, 'tw-content-live');
      dom.removeClass(root, 'tw-content-vods');
      dom.removeClass(root, 'tw-content-clips');
      dom.addClass(root, 'tw-content-' + String(key || '').toLowerCase());
    }
    dom.text(dom.get('tw-c-kind'), TW.i18n.t(key));
  };

  P.setViewers = function (text) {
    dom.text(dom.get('tw-c-viewers'), text || '');
    if (!this.root) { return; }
    if (text) { dom.addClass(this.root, 'tw-has-viewers'); }
    else { dom.removeClass(this.root, 'tw-has-viewers'); }
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
      self.loadInto(url);
    }, function () { self.showDialog(TW.i18n.t('ERROR_TOKEN')); });
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
      self.loadInto(info.url);
    }, function () { self.showDialog(TW.i18n.t('ERROR_RENDER')); });
  };

  P.handleBlur = function () {
    if (this.adapter.system && this.adapter.system.setScreensaver) {
      this.adapter.system.setScreensaver(false);
    }
  };

  P.handleHide = function () {
    this.stopInfoTimer();
    this.stopProgressTimer();
    this.closeChat();
    this.stopChatCapture();
    if (this.player) { try { this.player.stop(); this.player.destroy(); } catch (e) {} this.player = null; }
    dom.hide(this.root);
  };

  P.playerCallbacks = function () {
    var self = this;
    return {
      onBufferingStart: function () { self.showDialog(TW.i18n.t('BUFFERING')); },
      onBufferingProgress: function (pct) { self.showDialog(TW.i18n.t('BUFFERING') + ': ' + pct + '%'); },
      onBufferingComplete: function () { self.hideDialog(); },
      onPlaying: function () { self.hideDialog(); self.updateProgress(); },
      onEnded: function () { self.onContentEnded(); },
      onError: function (msg) { self.showDialog(msg || TW.i18n.t('ERROR_RENDER')); }
    };
  };

  // --- overlay ------------------------------------------------------------
  // Indeterminate loading: the modern ring spinner alone, no text.
  P.showLoading = function () {
    dom.removeClass(dom.get('tw-c-loading'), 'tw-msg');
    dom.show(dom.get('tw-c-loading'));
  };
  // Status message (errors, buffering %): text only, no spinner.
  P.showDialog = function (text) {
    dom.text(dom.get('tw-c-loading-text'), text || '');
    dom.addClass(dom.get('tw-c-loading'), 'tw-msg');
    dom.show(dom.get('tw-c-loading'));
  };
  P.hideDialog = function () { dom.hide(dom.get('tw-c-loading')); };

  P.updateInfo = function () {
    var self = this;
    if (!this.login || this.contentKind !== 'live') { return; }
    TW.api.streamInfo(this.login, function (info) {
      dom.text(dom.get('tw-c-name'), info.display);
      dom.text(dom.get('tw-c-title'), info.title);
      self.setViewers(info.online ? (TW.addCommas(info.viewers) + ' ' + TW.i18n.t('VIEWERS')) : '');
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
  };

  P.toggleChat = function () {
    if (this.contentKind !== 'live') { return; }
    if (this.chatOn) { this.closeChat(); } else { this.openChat(); }
  };

  P.openChat = function () {
    if (this.chatOn || !this.login) { return; }
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

  P.seekBy = function (seconds) {
    if (!this.canSeek()) { return; }
    var pos = 0, dur = this.duration || 0;
    try { if (this.player.getPosition) { pos = this.player.getPosition() || 0; } } catch (e) {}
    try { if (this.player.getDuration) { dur = this.player.getDuration() || dur; } } catch (e2) {}
    var next = Math.max(0, pos + seconds);
    if (dur > 0 && next > dur) { next = dur; }
    try { this.player.seekTo(next); } catch (e3) {}
    this.updateProgress();
  };

  P.visibleControls = function () {
    var ids = [];
    if (this.canSeek()) { ids.push('tw-ctl-back'); ids.push('tw-ctl-forward'); }
    ids.push('tw-ctl-channel');
    if (this.contentKind === 'live') { ids.push('tw-ctl-chat'); }
    ids.push('tw-ctl-quality');
    return ids;
  };

  P.refreshControls = function () {
    var all = ['tw-ctl-back', 'tw-ctl-forward', 'tw-ctl-channel', 'tw-ctl-chat', 'tw-ctl-quality'];
    var visible = this.visibleControls();
    var i, el;
    for (i = 0; i < all.length; i++) {
      el = dom.get(all[i]);
      dom.removeClass(el, 'tw-focused');
      dom.hide(el);
    }
    for (i = 0; i < visible.length; i++) { dom.show(dom.get(visible[i]), 'inline-block'); }
    if (this.controlIndex >= visible.length) { this.controlIndex = visible.length - 1; }
    if (this.controlIndex < 0) { this.controlIndex = 0; }
    dom.addClass(dom.get(visible[this.controlIndex]), 'tw-focused');
    dom.show(dom.get('tw-progress'), this.canSeek() ? 'block' : 'none');
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
  P.handleKeyDown = function (key) {
    if (this.panelShown) { return this.handlePanelKey(key); }
    switch (key) {
      case KEY.BACK:
        if (this.chatOn) { this.closeChat(); }
        else { this.shutdown(); }
        return true;
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
