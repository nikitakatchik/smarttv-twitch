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

    this.contentKind = 'live'; // 'live' | 'vod' | 'clip'
    this.startVod = null;      // if set on entry, play this VOD instead of live
    this.returnTo = null;      // where BACK exits to ('channelPage' | default browser)
    this.chatOn = false;
    this.chatClient = null;
    this.chatCount = 0;

    this.listMode = null;      // null | 'vods' | 'clips'
    this.listItems = [];
    this.listIndex = 0;
    this.listCursor = null;
    this.listLoading = false;
  }

  var CHAT_MAX = 80;           // cap chat rows kept in the DOM

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
      '<div class="tw-chat" id="tw-chat">' +
        '<div class="tw-chat-head" id="tw-chat-head"></div>' +
        '<div class="tw-chat-list" id="tw-chat-list"></div>' +
      '</div>' +
      '<div class="tw-clist" id="tw-clist">' +
        '<div class="tw-clist-head" id="tw-clist-head"></div>' +
        '<div class="tw-clist-body" id="tw-clist-body"></div>' +
      '</div>' +
      '<div class="tw-hints" id="tw-c-hints">' +
        '<span><b class="tw-dot tw-green">B</b> <span id="tw-h-chat"></span></span>' +
        '<span><b class="tw-dot tw-yellow">C</b> <span id="tw-h-vods"></span></span>' +
        '<span><b class="tw-dot tw-blue">D</b> <span id="tw-h-clips"></span></span>' +
        '<span><b class="tw-dot tw-red">A</b> <span id="tw-h-live"></span></span>' +
      '</div>' +
      '<div class="tw-loading" id="tw-c-loading"><div class="tw-spinner"></div>' +
        '<div class="tw-loading-text" id="tw-c-loading-text"></div></div>';
    (dom.get('app') || global.document.body).appendChild(root);
    this.root = root;
    dom.text(dom.get('tw-c-quality-label'), TW.i18n.t('QUALITY'));
    dom.text(dom.get('tw-chat-head'), TW.i18n.t('CHAT'));
    dom.text(dom.get('tw-h-chat'), TW.i18n.t('CHAT'));
    dom.text(dom.get('tw-h-vods'), TW.i18n.t('VODS'));
    dom.text(dom.get('tw-h-clips'), TW.i18n.t('CLIPS'));
    dom.text(dom.get('tw-h-live'), TW.i18n.t('LIVE'));
  };

  P.handleShow = function (data) {
    this.login = data && data.login;
    this.startVod = (data && data.vod) || null;   // play this VOD instead of live
    this.returnTo = (data && data.from) || null;   // e.g. 'channelPage'
    dom.show(this.root);
  };

  P.handleFocus = function () {
    if (this.adapter.system && this.adapter.system.setScreensaver) {
      this.adapter.system.setScreensaver(true, 100000);
    }
    this.hidePanel();
    this.closeList();
    this.closeChat();

    this.player = this.adapter.createPlayer(this.playerCallbacks());
    if (this.player.setDisplayArea) {
      this.player.setDisplayArea(0, 0, TW.config.screen.width, TW.config.screen.height);
    }
    // Entered from the channel page on a specific VOD? Play it; otherwise live.
    if (this.startVod) { var v = this.startVod; this.startVod = null; this.playVod(v); }
    else { this.playLive(); }
  };

  // --- content sources ----------------------------------------------------
  P.playLive = function () {
    var self = this;
    this.contentKind = 'live';
    dom.text(dom.get('tw-c-name'), this.login || '');
    dom.text(dom.get('tw-c-title'), '');
    dom.text(dom.get('tw-c-viewers'), '');
    dom.attr(dom.get('tw-c-icon'), 'src', '');
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
    dom.text(dom.get('tw-c-name'), this.login || '');
    dom.text(dom.get('tw-c-title'), item.title || '');
    dom.text(dom.get('tw-c-viewers'), TW.addCommas(item.viewers) + ' ' + TW.i18n.t('VIEWERS'));
  };

  P.playVod = function (item) {
    var self = this;
    this.contentKind = 'vod';
    this.closeChat();
    this.stopInfoTimer();
    this.showContentInfo(item);
    this.showLoading();
    TW.api.vodPlaybackUrl(item.id, function (url) {
      self.loadInto(url);
    }, function () { self.showDialog(TW.i18n.t('ERROR_TOKEN')); });
  };

  P.playClip = function (item) {
    var self = this;
    this.contentKind = 'clip';
    this.closeChat();
    this.stopInfoTimer();
    this.showContentInfo(item);
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
    this.closeChat();
    this.closeList();
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
    if (!this.login || this.contentKind !== 'live') { return; }
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

  // --- chat overlay (read-only, live only) --------------------------------
  P.toggleChat = function () {
    if (this.contentKind !== 'live') { return; }
    if (this.chatOn) { this.closeChat(); } else { this.openChat(); }
  };

  P.openChat = function () {
    if (this.chatOn || !this.login) { return; }
    var self = this;
    this.chatOn = true;
    this.clearChat();
    dom.addClass(this.root, 'tw-chat-open');
    dom.show(dom.get('tw-chat'));
    this.chatClient = TW.twitch.chat.connect(this.login, {
      onMessage: function (m) { self.addChatLine(m); },
      onError: function () {}
    });
  };

  P.closeChat = function () {
    if (this.chatClient) { try { this.chatClient.close(); } catch (e) {} this.chatClient = null; }
    this.chatOn = false;
    if (this.root) { dom.removeClass(this.root, 'tw-chat-open'); }
    dom.hide(dom.get('tw-chat'));
  };

  P.clearChat = function () { this.chatCount = 0; dom.html(dom.get('tw-chat-list'), ''); };

  P.addChatLine = function (m) {
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

  // --- VOD / Clip browse list ---------------------------------------------
  P.openList = function (mode) {
    if (this.listMode === mode) { return; }
    this.listMode = mode;
    this.listItems = [];
    this.listIndex = 0;
    this.listCursor = null;
    this.hidePanel();
    this.closeChat();
    dom.text(dom.get('tw-clist-head'), TW.i18n.t(mode === 'vods' ? 'VODS' : 'CLIPS'));
    dom.html(dom.get('tw-clist-body'), '');
    if (this.root) { dom.addClass(this.root, 'tw-list-open'); }
    dom.show(dom.get('tw-clist'));
    this.loadListData();
  };

  P.closeList = function () {
    this.listMode = null;
    if (this.root) { dom.removeClass(this.root, 'tw-list-open'); }
    dom.hide(dom.get('tw-clist'));
  };

  P.listEmpty = function (msgKey) {
    dom.html(dom.get('tw-clist-body'), '<div class="tw-clist-empty">' + dom.escape(TW.i18n.t(msgKey)) + '</div>');
  };

  P.loadListData = function () {
    if (this.listLoading || this.listCursor === false) { return; }
    this.listLoading = true;
    var self = this, mode = this.listMode, first = this.listItems.length === 0;
    if (first) { this.listEmpty('LOADING'); }

    var onOk = function (result) {
      if (self.listMode !== mode) { self.listLoading = false; return; } // user switched lists
      var start = self.listItems.length;
      for (var i = 0; i < result.items.length; i++) { self.listItems.push(result.items[i]); }
      self.listCursor = result.cursor ? result.cursor : false;
      if (self.listItems.length === 0) { self.listEmpty(mode === 'vods' ? 'NO_VODS' : 'NO_CLIPS'); }
      else { self.renderList(start); }
      self.listLoading = false;
    };
    var onFail = function () {
      self.listLoading = false;
      if (self.listItems.length === 0) { self.listEmpty(mode === 'vods' ? 'NO_VODS' : 'NO_CLIPS'); }
    };

    if (mode === 'vods') { TW.api.channelVideos(this.login, this.listCursor || null, onOk, onFail); }
    else { TW.api.channelClips(this.login, this.listCursor || null, onOk, onFail); }
  };

  P.renderList = function (fromIndex) {
    var body = dom.get('tw-clist-body');
    if (fromIndex === 0) { dom.html(body, ''); }
    for (var i = fromIndex; i < this.listItems.length; i++) {
      var it = this.listItems[i];
      var meta = TW.addCommas(it.viewers) + ' ' + TW.i18n.t('VIEWERS');
      if (it.duration) { meta += ' · ' + formatDuration(it.duration); }
      var row = dom.create('div', 'tw-clist-row');
      row.id = 'tw-clrow-' + i;
      row.innerHTML =
        '<img class="tw-clist-thumb" src="' + (it.thumb || '') + '">' +
        '<div class="tw-clist-meta">' +
          '<div class="tw-clist-title">' + dom.escape(it.title) + '</div>' +
          '<div class="tw-clist-sub">' + meta + '</div>' +
        '</div>';
      body.appendChild(row);
    }
    if (fromIndex === 0) { this.listFocus(); }
  };

  P.listMove = function (idx) {
    var old = dom.get('tw-clrow-' + this.listIndex);
    if (old) { dom.removeClass(old, 'tw-focused'); }
    this.listIndex = idx;
    this.listFocus();
  };

  P.listFocus = function () {
    var row = dom.get('tw-clrow-' + this.listIndex);
    if (row) { dom.addClass(row, 'tw-focused'); if (row.scrollIntoView) { row.scrollIntoView(false); } }
    if (this.listIndex + 4 >= this.listItems.length && this.listCursor && !this.listLoading) { this.loadListData(); }
  };

  P.activateListItem = function () {
    var it = this.listItems[this.listIndex];
    if (!it) { return; }
    this.closeList();
    if (it.kind === 'vod') { this.playVod(it); } else { this.playClip(it); }
  };

  P.handleListKey = function (key) {
    if (key === KEY.UP) { if (this.listIndex > 0) { this.listMove(this.listIndex - 1); } return true; }
    if (key === KEY.DOWN) { if (this.listIndex < this.listItems.length - 1) { this.listMove(this.listIndex + 1); } return true; }
    if (key === KEY.ENTER) { this.activateListItem(); return true; }
    if (key === KEY.BACK || key === KEY.RIGHT) { this.closeList(); return true; }
    if (key === KEY.YELLOW) { this.openList('vods'); return true; }
    if (key === KEY.BLUE) { this.openList('clips'); return true; }
    if (key === KEY.RED) { this.closeList(); this.playLive(); return true; }
    return true; // swallow everything else while the list is open
  };

  // A VOD or clip that plays to the end reopens its list (keep browsing this
  // channel); a live stream ending returns to the grid.
  P.onContentEnded = function () {
    if (this.contentKind === 'clip') { this.openList('clips'); }
    else if (this.contentKind === 'vod') { this.openList('vods'); }
    else { this.shutdown(); }
  };

  P.shutdown = function () {
    // Came from a channel page (e.g. selected one of its VODs)? Return there.
    if (this.returnTo === 'channelPage' && this.login) { TW.app.goToChannelPage(this.login); }
    else { TW.app.goToBrowser(); }
  };

  // --- keys ---------------------------------------------------------------
  P.handleKeyDown = function (key) {
    if (this.listMode) { return this.handleListKey(key); }
    switch (key) {
      case KEY.BACK:
        if (this.panelShown) { this.hidePanel(); }
        else if (this.chatOn) { this.closeChat(); }
        else { this.shutdown(); }
        return true;
      case KEY.GREEN:
        this.toggleChat(); return true;
      case KEY.YELLOW:
        this.openList('vods'); return true;
      case KEY.BLUE:
        this.openList('clips'); return true;
      case KEY.RED:
        if (this.contentKind !== 'live') { this.playLive(); }
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
