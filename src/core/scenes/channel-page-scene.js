/*!
 * core/scenes/channel-page-scene.js — a channel's landing page: info + VODs.
 *
 * Reached by selecting an OFFLINE channel in the Following tab (and, later, from
 * a button on the player). Unlike the channel/player scene, nothing plays here:
 * a header shows the channel (avatar, name, follower count, bio) and a grid below
 * lists its past broadcasts. Selecting a VOD hands off to the player scene to
 * play it; BACK returns to the Following tab.
 *
 * The VOD grid reuses the browse grid's look and its pinned-row scroll + fixed
 * selection frame, but kept local to this scene (its own ids) so the two never
 * fight over the shared frame element.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var dom = TW.dom;
  var KEY = TW.KEY;

  function ChannelPageScene(adapter) {
    this.adapter = adapter;
    this.login = null;
    this.items = [];      // VODs
    this.cells = [];
    this.rowEls = [];
    this.cursor = null;   // pagination cursor (null = start, false = ended)
    this.loading = false;
    this.x = 0;
    this.y = 0;
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function formatDuration(sec) {
    sec = Math.floor(sec || 0);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? (h + ':' + pad2(m) + ':' + pad2(s)) : (m + ':' + pad2(s));
  }

  var P = ChannelPageScene.prototype;

  P.initialize = function () {
    var root = dom.create('div', 'tw-scene', '');
    root.id = 'tw-cpage';
    root.innerHTML =
      '<div class="tw-cp-head">' +
        '<img class="tw-cp-avatar" id="tw-cp-avatar" src="">' +
        '<div class="tw-cp-info">' +
          '<div class="tw-cp-name" id="tw-cp-name"></div>' +
          '<div class="tw-cp-followers" id="tw-cp-followers"></div>' +
          '<div class="tw-cp-desc" id="tw-cp-desc"></div>' +
        '</div>' +
      '</div>' +
      '<div class="tw-cp-grid-wrap" id="tw-cp-grid-wrap">' +
        '<div class="tw-cp-scroll" id="tw-cp-scroll"><table class="tw-grid" id="tw-cp-grid"></table></div>' +
        '<div class="tw-grid-frame tw-cp-frame" id="tw-cp-frame"></div>' +
        '<div class="tw-cp-empty" id="tw-cp-empty"></div>' +
      '</div>' +
      '<div class="tw-loading" id="tw-cp-loading"><div class="tw-spinner"></div>' +
        '<div class="tw-loading-text" id="tw-cp-loading-text"></div></div>';
    (dom.get('app') || global.document.body).appendChild(root);
    this.root = root;
  };

  P.handleShow = function (data) {
    this.login = data && data.login;
    dom.show(this.root);
  };
  P.handleHide = function () { this.clean(); dom.hide(this.root); };
  P.handleBlur = function () {};

  P.handleFocus = function () {
    this.clean();
    this.loadInfo();
    this.showLoading();
    this.loadData();
  };

  // --- header -------------------------------------------------------------
  P.loadInfo = function () {
    var self = this;
    // Prime with what we already know so the header isn't blank during the call.
    dom.text(dom.get('tw-cp-name'), this.login || '');
    dom.text(dom.get('tw-cp-followers'), '');
    dom.text(dom.get('tw-cp-desc'), '');
    dom.attr(dom.get('tw-cp-avatar'), 'src', '');
    TW.api.channelInfo(this.login, function (info) {
      dom.text(dom.get('tw-cp-name'), info.display || self.login || '');
      dom.text(dom.get('tw-cp-followers'),
        info.followers ? TW.i18n.t('FOLLOWERS', TW.shortNumber(info.followers)) : '');
      dom.text(dom.get('tw-cp-desc'), info.description || '');
      if (info.avatar) { dom.attr(dom.get('tw-cp-avatar'), 'src', info.avatar); }
    }, TW.noop);
  };

  // --- VOD grid -----------------------------------------------------------
  P.showLoading = function () {
    // The ring overlays the grid area (absolute, high z-index), so the grid can
    // stay mounted underneath while VODs load.
    dom.removeClass(dom.get('tw-cp-loading'), 'tw-msg');
    dom.hide(dom.get('tw-cp-empty'));
    dom.show(dom.get('tw-cp-loading'));
  };
  P.showEmpty = function () {
    dom.hide(dom.get('tw-cp-loading'));
    this.hideFrame();
    dom.text(dom.get('tw-cp-empty'), TW.i18n.t('NO_VODS'));
    dom.show(dom.get('tw-cp-empty'));
  };
  P.showGrid = function () {
    dom.hide(dom.get('tw-cp-loading'));
    dom.hide(dom.get('tw-cp-empty'));
  };

  P.clean = function () {
    this.items = [];
    this.cells = [];
    this.rowEls = [];
    this.cursor = null;
    this.x = 0;
    this.y = 0;
    dom.html(dom.get('tw-cp-grid'), '');
    this.setScroll(0);
    this.hideFrame();
  };

  P.loadData = function () {
    if (this.loading || this.cursor === false) { return; }
    this.loading = true;
    var self = this, cursor = this.cursor || null;
    TW.api.channelVideos(this.login, cursor, function (result) {
      self.onPage(result);
    }, function () {
      self.loading = false;
      if (self.items.length === 0) { self.showEmpty(); }
      else { self.cursor = false; }   // stop paginating on a later-page failure
    });
  };

  P.onPage = function (result) {
    var start = this.items.length;
    for (var i = 0; i < result.items.length; i++) { this.items.push(result.items[i]); }
    this.cursor = result.cursor ? result.cursor : false;
    if (this.items.length === 0) { this.loading = false; this.showEmpty(); return; }
    this.appendCells(start);
    this.showGrid();
    if (start === 0 && this.cells.length) { this.x = 0; this.y = 0; this.addFocus(); }
    this.loading = false;
  };

  P.appendCells = function (fromIndex) {
    var cols = TW.config.columns;
    var grid = dom.get('tw-cp-grid');
    for (var i = fromIndex; i < this.items.length; i++) {
      var ri = Math.floor(i / cols);
      var row = this.rowEls[ri];
      if (!row) { row = dom.create('tr'); grid.appendChild(row); this.rowEls[ri] = row; }
      var cell = this.createCell(this.items[i]);
      row.appendChild(cell);
      this.cells[i] = cell;
    }
    // Pad the short last row so table-layout:fixed keeps the 25% columns instead
    // of stretching a lone VOD across the whole width.
    var last = this.rowEls[this.rowEls.length - 1];
    if (last) {
      for (var p = last.childNodes.length; p < cols; p++) {
        last.appendChild(dom.create('td', 'tw-cell tw-cell-pad'));
      }
    }
  };

  P.createCell = function (item) {
    var td = dom.create('td', 'tw-cell');
    var title = dom.escape(item.title || '');
    var views = TW.shortNumber(item.viewers);
    var dur = formatDuration(item.duration);
    td.innerHTML =
      '<div class="tw-cell-inner">' +
        '<img class="tw-thumb" src="' + (item.thumb || '') + '">' +
        '<div class="tw-meta">' +
          '<div class="tw-meta-title">' + title + '</div>' +
          '<div class="tw-meta-row">' +
            '<span class="tw-meta-views">' + views + '</span>' +
            '<span class="tw-meta-name">' + dur + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    return td;
  };

  // --- focus frame + scroll (mirrors browse grid) -------------------------
  P.setScroll = function (offset) {
    var s = dom.get('tw-cp-scroll');
    if (!s) { return; }
    var t = 'translate3d(0,' + (-offset) + 'px,0)';
    s.style.webkitTransform = t;
    s.style.transform = t;
  };

  P.indexOfCursor = function () { return this.y * TW.config.columns + this.x; };
  P.focusedCell = function () { return this.cells[this.indexOfCursor()]; };

  P.removeFocus = function () {
    var c = this.focusedCell();
    if (c) { dom.removeClass(c.firstChild, 'tw-focused'); }
  };
  P.addFocus = function () {
    var c = this.focusedCell();
    if (!c) { return; }
    dom.addClass(c.firstChild, 'tw-focused');
    this.scrollToCursor();
    this.updateFrame();
    var nearEnd = this.indexOfCursor() + TW.config.columns * 2 >= this.items.length;
    if (nearEnd && this.cursor && !this.loading) { this.loadData(); }
  };

  P.scrollToCursor = function () {
    var row = this.rowEls[this.y];
    this.setScroll(row ? row.offsetTop : 0);
  };

  P.updateFrame = function () {
    var frame = dom.get('tw-cp-frame');
    if (!frame) { return; }
    var c = this.focusedCell();
    if (!c) { frame.style.opacity = '0'; return; }
    var inner = c.firstChild;
    var row = this.rowEls[this.y];
    var rowTop = row ? row.offsetTop : 0;
    var reappearing = (frame.style.opacity !== '1');
    if (reappearing) { frame.style.webkitTransition = frame.style.transition = 'none'; }
    frame.style.left = inner.offsetLeft + 'px';
    frame.style.top = (inner.offsetTop - rowTop) + 'px';
    frame.style.width = inner.offsetWidth + 'px';
    frame.style.height = inner.offsetHeight + 'px';
    if (reappearing) {
      frame.offsetWidth;   // commit the snap before transitions resume
      frame.style.webkitTransition = frame.style.transition = '';
    }
    frame.style.opacity = '1';
    var img = inner.getElementsByTagName('img')[0];
    if (img && !img.complete) {
      var self = this;
      img.onload = function () { if (self.focusedCell() === c) { self.updateFrame(); } };
    }
  };

  P.hideFrame = function () {
    var frame = dom.get('tw-cp-frame');
    if (frame) { frame.style.opacity = '0'; }
  };

  P.move = function (x, y) { this.removeFocus(); this.x = x; this.y = y; this.addFocus(); };

  // --- keys ---------------------------------------------------------------
  P.handleKeyDown = function (key) {
    if (key === KEY.BACK) { TW.app.goToBrowser(TW.BrowserScene.MODE.FOLLOWED); return true; }
    if (this.loading) { return true; }
    var cols = TW.config.columns;
    var rows = Math.ceil(this.items.length / cols);
    var cellsInRow = function (y) { return Math.min(cols, this.items.length - y * cols); };

    if (key === KEY.LEFT && this.x > 0) { this.move(this.x - 1, this.y); return true; }
    if (key === KEY.RIGHT && this.x < cellsInRow.call(this, this.y) - 1) { this.move(this.x + 1, this.y); return true; }
    if (key === KEY.UP && this.y > 0) { this.move(this.x, this.y - 1); return true; }
    if (key === KEY.DOWN && this.y < rows - 1 && this.x < cellsInRow.call(this, this.y + 1)) {
      this.move(this.x, this.y + 1); return true;
    }
    if (key === KEY.ENTER) { this.activate(); return true; }
    return true;   // swallow everything else (no tab row on this screen)
  };

  P.activate = function () {
    var item = this.items[this.indexOfCursor()];
    if (!item) { return; }
    TW.app.goToChannel(this.login, { vod: item, from: 'channelPage' });
  };

  TW.ChannelPageScene = ChannelPageScene;
})(this);
