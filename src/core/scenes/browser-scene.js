/*!
 * core/scenes/browser-scene.js — the stream/game grid.
 *
 * Rebuilt from the original SceneBrowser.js: same four modes (Channels, Games,
 * Games>Streams, Open) and color-button UX, but cursor-paginated against
 * TW.api, rendered with TW.dom (no jQuery), and driven by canonical keys.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var dom = TW.dom;
  var KEY = TW.KEY;

  var MODE = { ALL: 0, GAMES: 1, GAMES_STREAMS: 2, OPEN: 3, FOLLOWED: 4 };

  // The top row as a left-to-right d-pad path: the four colour-button tabs,
  // then the account chip at the far right. Lets remotes without A/B/C/D
  // buttons reach every tab. (Order matches the on-screen layout so LEFT/RIGHT
  // move the way they look.)
  var NAV = [
    { id: 'tw-tip-all',      mode: MODE.ALL },
    { id: 'tw-tip-games',    mode: MODE.GAMES },
    { id: 'tw-tip-followed', mode: MODE.FOLLOWED },
    { id: 'tw-tip-open',     mode: MODE.OPEN },
    { id: 'tw-account',      mode: null }          // chip -> login (far right)
  ];

  function BrowserScene(adapter) {
    this.adapter = adapter;
    this.mode = -1;
    this.items = [];
    this.cells = [];
    this.rowEls = [];
    this.cursor = null;        // pagination cursor (null = start, false = ended)
    this.loading = false;
    this.x = 0;
    this.y = 0;
    this.selectedGame = null;
    this.built = false;
    this.onTopNav = false;     // top row (chip + tabs) holds d-pad focus
    this.navIndex = 0;         // which NAV item is focused while onTopNav
    this.pendingMode = null;   // mode to enter on next focus (e.g. after login)
  }

  var P = BrowserScene.prototype;

  P.initialize = function () {
    var root = dom.create('div', 'tw-scene', '');
    root.id = 'tw-browser';
    root.innerHTML =
      '<div class="tw-topbar">' +
        '<img class="tw-logo" src="assets/logo.png" alt="">' +
        '<div class="tw-account" id="tw-account">&#9679; <span id="tw-acct-label"></span></div>' +
        '<div class="tw-tips">' +
          '<span class="tw-tip" id="tw-tip-all"><span class="tw-tip-box"><span class="tw-tip-label" id="tw-l-all"></span></span></span>' +
          '<span class="tw-tip" id="tw-tip-games"><span class="tw-tip-box"><span class="tw-tip-label" id="tw-l-games"></span></span></span>' +
          '<span class="tw-tip" id="tw-tip-followed"><span class="tw-tip-box"><span class="tw-tip-label" id="tw-l-followed"></span></span></span>' +
          '<span class="tw-tip" id="tw-tip-open"><span class="tw-tip-box"><span class="tw-tip-label" id="tw-l-open"></span></span></span>' +
          '<div class="tw-tip-cursor" id="tw-tip-cursor"></div>' +
        '</div>' +
      '</div>' +
      '<div class="tw-loading" id="tw-b-loading"><div class="tw-spinner"></div>' +
        '<div class="tw-loading-text" id="tw-b-loading-text"></div></div>' +
      '<div class="tw-grid-wrap" id="tw-grid-wrap">' +
        '<div class="tw-grid-scroll" id="tw-grid-scroll"><table class="tw-grid" id="tw-grid"></table></div>' +
        '<div class="tw-grid-frame" id="tw-grid-frame"></div>' +
      '</div>' +
      '<div class="tw-open" id="tw-open">' +
        '<input class="tw-open-input" id="tw-open-input" type="text">' +
        '<div class="tw-open-go" id="tw-open-go"></div>' +
      '</div>';
    (dom.get('app') || global.document.body).appendChild(root);
    this.root = root;
    this.built = true;
    this.initLabels();
  };

  P.initLabels = function () {
    dom.text(dom.get('tw-l-all'), TW.i18n.t('CHANNELS'));
    dom.text(dom.get('tw-l-games'), TW.i18n.t('GAMES'));
    dom.text(dom.get('tw-l-followed'), TW.i18n.t('FOLLOWED'));
    dom.text(dom.get('tw-l-open'), TW.i18n.t('OPEN'));
    dom.text(dom.get('tw-open-go'), TW.i18n.t('OPEN'));
    dom.attr(dom.get('tw-open-input'), 'placeholder', TW.i18n.t('PLACEHOLDER_OPEN'));
  };

  // Force all four tab pills to the width of the widest one (text left-aligned),
  // so the row reads as a clean uniform set regardless of label length/language.
  // Measured live because labels are i18n; runs when the scene is visible.
  P.equalizeTabs = function () {
    var ids = ['tw-tip-all', 'tw-tip-games', 'tw-tip-followed', 'tw-tip-open'];
    var els = [], max = 0, i, el;
    for (i = 0; i < ids.length; i++) {
      el = dom.get(ids[i]);
      if (el) { el.style.width = ''; els.push(el); }   // reset before measuring
    }
    for (i = 0; i < els.length; i++) { if (els[i].offsetWidth > max) { max = els[i].offsetWidth; } }
    if (!max) { return; }   // hidden / not laid out yet
    max += 8;   // a little slack so the widest label never wraps (sub-pixel safe)
    for (i = 0; i < els.length; i++) { els[i].style.width = max + 'px'; }
  };

  P.updateAccount = function () {
    var label;
    if (TW.auth.isLoggedIn()) {
      var u = TW.auth.user();
      label = (u && u.display) || TW.i18n.t('ACCOUNT');
    } else {
      label = TW.i18n.t('LOGIN');
    }
    dom.text(dom.get('tw-acct-label'), label);
  };

  // --- lifecycle ----------------------------------------------------------
  P.handleShow = function () { dom.show(this.root); this.equalizeTabs(); };
  P.handleHide = function () { dom.hide(this.root); this.clean(); };
  P.handleFocus = function () {
    this.updateAccount();
    this.clearNavFocus();
    var m = (this.pendingMode == null) ? MODE.ALL : this.pendingMode;
    this.pendingMode = null;
    this.switchMode(m, true);
  };
  P.handleBlur = function () {};

  // --- data ---------------------------------------------------------------
  // Indeterminate loading: the modern ring spinner alone, no text.
  P.showLoading = function () {
    dom.hide(dom.get('tw-grid-wrap'));
    dom.hide(dom.get('tw-open'));
    dom.removeClass(dom.get('tw-b-loading'), 'tw-msg');
    dom.show(dom.get('tw-b-loading'));
  };
  // Status message (e.g. load error): text only, no spinner (.tw-msg hides it).
  P.showDialog = function (text) {
    dom.hide(dom.get('tw-grid-wrap'));
    dom.hide(dom.get('tw-open'));
    dom.text(dom.get('tw-b-loading-text'), text || '');
    dom.addClass(dom.get('tw-b-loading'), 'tw-msg');
    dom.show(dom.get('tw-b-loading'));
  };
  P.showGrid = function () {
    dom.hide(dom.get('tw-b-loading'));
    dom.hide(dom.get('tw-open'));
    dom.show(dom.get('tw-grid-wrap'));
  };
  P.showOpen = function () {
    dom.hide(dom.get('tw-b-loading'));
    dom.hide(dom.get('tw-grid-wrap'));
    dom.show(dom.get('tw-open'));
  };

  P.clean = function () {
    this.items = [];
    this.cells = [];
    this.rowEls = [];
    this.cursor = null;
    this.x = 0;
    this.y = 0;
    dom.html(dom.get('tw-grid'), '');
    this.setScroll(0);   // jump back to the top row for the new content
    this.hideFrame();
  };

  // Translate the grid so the focused row sits in the top ("first") row slot.
  // Up/Down scrolls the content under a fixed cursor row; Left/Right just moves
  // the frame within the current row (same offset -> no animation fires).
  P.setScroll = function (offset) {
    var s = dom.get('tw-grid-scroll');
    if (!s) { return; }
    var t = 'translate3d(0,' + (-offset) + 'px,0)';
    s.style.webkitTransform = t;
    s.style.transform = t;
  };

  P.scrollToCursor = function () {
    var row = this.rowEls[this.y];
    this.setScroll(row ? row.offsetTop : 0);
  };

  // Position the fixed selection frame over the focused tile's RESTING spot
  // (the row is pinned to the top, so top = cell-inner's offset minus the row's
  // offset = the cell padding). offset* are layout coords, unaffected by the
  // scroll transform, so the frame lands where the tile settles — and since the
  // frame doesn't scroll, its top line never clips while content scrolls under.
  P.updateFrame = function () {
    var frame = dom.get('tw-grid-frame');
    if (!frame) { return; }
    var c = this.focusedCell();
    if (!c) { frame.style.opacity = '0'; return; }
    var inner = c.firstChild;                       // .tw-cell-inner
    var row = this.rowEls[this.y];
    var rowTop = row ? row.offsetTop : 0;
    // If the frame is hidden it's (re)appearing — entering the grid or switching
    // tabs. Snap it to the new spot (no horizontal slide across the old grid);
    // only moves while it's already visible (Left/Right) animate.
    var reappearing = (frame.style.opacity !== '1');
    if (reappearing) { frame.style.webkitTransition = frame.style.transition = 'none'; }
    frame.style.left = inner.offsetLeft + 'px';
    frame.style.top = (inner.offsetTop - rowTop) + 'px';
    frame.style.width = inner.offsetWidth + 'px';
    frame.style.height = inner.offsetHeight + 'px';
    if (reappearing) {
      frame.offsetWidth;   // force reflow so the snap commits before transitions resume
      frame.style.webkitTransition = frame.style.transition = '';   // restore (fade in only)
    }
    frame.style.opacity = '1';
    // The thumbnail may still be loading (cell height collapsed); re-measure on
    // load so the frame matches the final tile, but only if focus hasn't moved.
    var img = inner.getElementsByTagName('img')[0];
    if (img && !img.complete) {
      var self = this;
      // Re-measure only if this cell is STILL the focused grid tile — not if the
      // user has since moved to the tab row (onTopNav) or another cell, else a
      // late-loading image would resurrect the frame where it shouldn't be.
      img.onload = function () { if (!self.onTopNav && self.focusedCell() === c) { self.updateFrame(); } };
    }
  };

  P.hideFrame = function () {
    var frame = dom.get('tw-grid-frame');
    if (frame) { frame.style.opacity = '0'; }   // fades out (CSS transition)
  };

  P.refresh = function () {
    if (this.mode === MODE.OPEN) { return; }
    this.clean();
    this.loadData();
  };

  P.loadData = function () {
    if (this.loading || this.cursor === false) { return; }
    this.loading = true;
    if (this.items.length === 0) { this.showLoading(); }

    var self = this;
    var cursor = this.cursor || null;
    var onOk = function (result) { self.onPage(result); };
    var onFail = function () {
      self.loading = false;
      if (self.items.length === 0) {
        self.showDialog(TW.i18n.t('ERROR_LOAD'));
      } else {
        // A later page failed: stop paginating so a near-end scroll doesn't
        // silently re-fire loadData() on every move. Switching tabs re-fetches.
        self.cursor = false;
        TW.log.warn('browse: page load failed, stopping pagination');
      }
    };

    if (this.mode === MODE.GAMES) { TW.api.topGames(cursor, onOk, onFail); }
    else if (this.mode === MODE.GAMES_STREAMS) { TW.api.streamsByGame(this.selectedGame, cursor, onOk, onFail); }
    else if (this.mode === MODE.FOLLOWED) { TW.api.followedStreams(cursor, onOk, onFail); }
    else { TW.api.topStreams(cursor, onOk, onFail); }
  };

  P.onPage = function (result) {
    var start = this.items.length;
    for (var i = 0; i < result.items.length; i++) { this.items.push(result.items[i]); }
    this.cursor = result.cursor ? result.cursor : false; // false => no more pages
    this.appendCells(start);
    this.showGrid();
    // Highlight the first tile when the first page lands; later pages must not
    // yank focus back to the top. (Skip if the user is parked on the tab row.)
    if (start === 0 && this.cells.length && !this.onTopNav) { this.x = 0; this.y = 0; this.addFocus(); }
    this.loading = false;
  };

  // --- rendering ----------------------------------------------------------
  P.appendCells = function (fromIndex) {
    var cols = TW.config.columns;
    var grid = dom.get('tw-grid');
    // Place each item in row floor(i/cols); reuse the row if it already exists
    // so a page that starts mid-row (e.g. 30 items, 4 columns) continues the
    // previous page's last row instead of leaving it short. Rows are tracked
    // explicitly rather than via grid.lastChild, which on some old WebKit is an
    // implicit <tbody> rather than the <tr>.
    for (var i = fromIndex; i < this.items.length; i++) {
      var ri = Math.floor(i / cols);
      var row = this.rowEls[ri];
      if (!row) { row = dom.create('tr'); grid.appendChild(row); this.rowEls[ri] = row; }
      var cell = this.createCell(this.items[i]);
      row.appendChild(cell);
      this.cells[i] = cell;
    }
  };

  P.createCell = function (item) {
    var isGame = item.kind === 'game';
    var td = dom.create('td', 'tw-cell' + (isGame ? ' tw-cell-game' : ''));
    var img = isGame ? item.box : item.thumb;
    // Streams: stream title on top, then channel name (left) + viewer count
    // (right) on one line. Games have no title — just the name + count row.
    var name = dom.escape(item.display || '');
    var title = isGame ? '' : dom.escape(item.title || '');
    var views = TW.shortNumber(item.viewers);
    td.innerHTML =
      '<div class="tw-cell-inner">' +
        '<img class="tw-thumb" src="' + img + '">' +
        '<div class="tw-meta">' +
          (title ? '<div class="tw-meta-title">' + title + '</div>' : '') +
          '<div class="tw-meta-row">' +
            '<span class="tw-meta-views">' + views + '</span>' +
            '<span class="tw-meta-name">' + name + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    return td;
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
    // Prefetch the next page as the user nears the end of what's loaded.
    var nearEnd = this.indexOfCursor() + TW.config.columns * 2 >= this.items.length;
    if (nearEnd && this.cursor && !this.loading) { this.loadData(); }
  };

  // --- modes --------------------------------------------------------------
  P.switchMode = function (mode, force) {
    if (mode === this.mode && !force) { return; }
    // The Followed tab needs a logged-in user — divert to the login scene.
    if (mode === MODE.FOLLOWED && !TW.auth.isLoggedIn()) { TW.app.goToLogin(); return; }
    this.mode = mode;
    this.clearNavFocus();
    this.selectedGame = (mode === MODE.GAMES_STREAMS) ? this.selectedGame : null;

    var ids = ['tw-tip-all', 'tw-tip-games', 'tw-tip-followed', 'tw-tip-open'];
    for (var i = 0; i < ids.length; i++) { dom.removeClass(dom.get(ids[i]), 'tw-tip-active'); }
    var activeId = (mode === MODE.OPEN) ? 'tw-tip-open'
      : (mode === MODE.FOLLOWED) ? 'tw-tip-followed'
      : (mode === MODE.GAMES || mode === MODE.GAMES_STREAMS) ? 'tw-tip-games'
      : 'tw-tip-all';
    dom.addClass(dom.get(activeId), 'tw-tip-active');

    if (mode === MODE.OPEN) {
      this.clean();
      this.showOpen();
      this.openCursor = 0;
      this.refreshOpenFocus();
      var input = dom.get('tw-open-input');
      if (input && input.focus) { try { input.focus(); } catch (e) {} }
    } else {
      this.refresh();
    }
  };

  P.refreshOpenFocus = function () {
    var input = dom.get('tw-open-input'), go = dom.get('tw-open-go');
    dom.removeClass(input, 'tw-focused'); dom.removeClass(go, 'tw-focused');
    dom.addClass(this.openCursor === 0 ? input : go, 'tw-focused');
  };

  P.openSelected = function () {
    var val = (dom.get('tw-open-input').value || '').replace(/^\s+|\s+$/g, '').toLowerCase();
    if (val) { TW.app.goToChannel(val); }
  };

  // --- keys ---------------------------------------------------------------
  P.handleKeyDown = function (key) {
    if (key === KEY.BACK) {
      // On the tab row already -> exit the app.
      if (this.onTopNav) {
        if (this.adapter.system && this.adapter.system.exit) { this.adapter.system.exit(); return true; }
        return false;
      }
      // A game's stream list is a sub-view -> step back to the games grid.
      if (this.mode === MODE.GAMES_STREAMS) { this.switchMode(MODE.GAMES, true); return true; }
      // Anywhere else in a grid (or the Open field) -> return focus to the tabs.
      this.focusTopNav();
      return true;
    }
    // Colour buttons switch tabs; pressing the active tab again force-refreshes.
    if (key === KEY.RED) { this.switchMode(MODE.ALL, this.mode === MODE.ALL); return true; }
    if (key === KEY.GREEN) { this.switchMode(MODE.GAMES, this.mode === MODE.GAMES); return true; }
    if (key === KEY.YELLOW) { this.switchMode(MODE.FOLLOWED, this.mode === MODE.FOLLOWED); return true; }
    if (key === KEY.BLUE) { this.switchMode(MODE.OPEN); return true; }

    if (this.onTopNav) { return this.handleTopNavKey(key); }
    if (this.loading && this.mode !== MODE.OPEN) { return true; }

    if (this.mode === MODE.OPEN) { return this.handleOpenKey(key); }
    return this.handleGridKey(key);
  };

  // --- top navigation row (account chip + colour-button tabs) -------------
  // Reachable with the d-pad so remotes lacking A/B/C/D buttons can still
  // switch tabs: UP from the content lands here, LEFT/RIGHT walks the row,
  // ENTER activates, DOWN drops back into the content.
  P.activeNavIndex = function () {
    // Find the tab matching the current mode (order-independent). GAMES_STREAMS
    // shares the Games tab.
    var m = (this.mode === MODE.GAMES_STREAMS) ? MODE.GAMES : this.mode;
    for (var i = 0; i < NAV.length; i++) {
      if (NAV[i].mode === m) { return i; }
    }
    return 0;
  };

  P.clearNavFocus = function () {
    this.onTopNav = false;
    dom.removeClass(dom.get('tw-account'), 'tw-focused');
    this.hideTabCursor();
  };

  P.hideTabCursor = function () {
    var cursor = dom.get('tw-tip-cursor');
    if (cursor) { cursor.style.opacity = '0'; }
  };

  P.highlightNav = function () {
    // The account chip (mode null) keeps its own focus ring; the four tabs share
    // a single cursor that slides between them.
    var item = NAV[this.navIndex];
    if (item && item.mode === null) { dom.addClass(dom.get('tw-account'), 'tw-focused'); }
    else { dom.removeClass(dom.get('tw-account'), 'tw-focused'); }
    this.moveTabCursor();
  };

  P.moveTabCursor = function () {
    var cursor = dom.get('tw-tip-cursor');
    if (!cursor) { return; }
    var item = NAV[this.navIndex];
    var box = (item && item.mode !== null) ? dom.get(item.id).firstChild : null;  // .tw-tip-box
    if (!box) { cursor.style.opacity = '0'; return; }   // chip / none focused
    // Snap (no slide) when (re)appearing — entering the tab row or coming from
    // the chip; only tab-to-tab moves animate.
    var reappearing = (cursor.style.opacity !== '1');
    if (reappearing) { cursor.style.webkitTransition = cursor.style.transition = 'none'; }
    cursor.style.left = box.offsetLeft + 'px';
    cursor.style.top = box.offsetTop + 'px';
    cursor.style.width = box.offsetWidth + 'px';
    cursor.style.height = box.offsetHeight + 'px';
    if (reappearing) {
      cursor.offsetWidth;   // force reflow so the snap commits before transitions resume
      cursor.style.webkitTransition = cursor.style.transition = '';
    }
    cursor.style.opacity = '1';
  };

  P.focusTopNav = function () {
    this.removeFocus();
    this.hideFrame();   // no tile is selected while the tab row holds focus
    dom.removeClass(dom.get('tw-open-input'), 'tw-focused');
    dom.removeClass(dom.get('tw-open-go'), 'tw-focused');
    this.onTopNav = true;
    this.navIndex = this.activeNavIndex();
    this.highlightNav();
  };

  P.handleTopNavKey = function (key) {
    if (key === KEY.LEFT) { this.navIndex = Math.max(0, this.navIndex - 1); this.highlightNav(); return true; }
    if (key === KEY.RIGHT) { this.navIndex = Math.min(NAV.length - 1, this.navIndex + 1); this.highlightNav(); return true; }
    if (key === KEY.DOWN) { this.leaveTopNav(); return true; }
    if (key === KEY.ENTER) { this.activateNav(); return true; }
    return true;
  };

  // Landing column when dropping into the grid from the top row (DOWN, or ENTER
  // on the active tab). Rather than restoring the last-used column, pick the one
  // sitting spatially under the focused top-row item: Channels/Games (tabs 1-2)
  // -> column 1, Followed/Open (tabs 3-4) -> column 2, Login chip -> column 4.
  // Relies on NAV being in left-to-right screen order; clamped to the cells
  // actually present in the first row (small result sets).
  P.gridEntryColumn = function () {
    var item = NAV[this.navIndex];
    var col = (item && item.mode === null) ? 3 : (this.navIndex <= 1 ? 0 : 1);
    var inRow0 = Math.min(TW.config.columns, this.items.length);
    if (col > inRow0 - 1) { col = inRow0 - 1; }
    return col < 0 ? 0 : col;
  };

  P.leaveTopNav = function () {
    this.clearNavFocus();
    if (this.mode === MODE.OPEN) { this.openCursor = 0; this.refreshOpenFocus(); return; }
    // Always drop into the first row; the column is fixed by the focused top-row
    // item (see gridEntryColumn), not the previously memorized column.
    this.move(this.gridEntryColumn(), 0);
  };

  P.activateNav = function () {
    var item = NAV[this.navIndex];
    if (!item) { return; }
    this.clearNavFocus();
    if (item.mode === null) { TW.app.goToLogin(); return; }
    // Already on this tab -> just drop into the content; otherwise switch.
    if (item.mode === this.mode) { this.leaveTopNav(); }
    else { this.switchMode(item.mode, false); }
  };

  P.handleOpenKey = function (key) {
    if (key === KEY.UP) {
      if (this.openCursor === 1) { this.openCursor = 0; this.refreshOpenFocus(); }
      else { this.focusTopNav(); }   // already at the input -> up to the tab row
      return true;
    }
    if (key === KEY.DOWN) { this.openCursor = 1; this.refreshOpenFocus(); return true; }
    if (key === KEY.ENTER) {
      if (this.openCursor === 0 && this.adapter.ime && this.adapter.ime.edit) {
        var self = this, input = dom.get('tw-open-input');
        this.adapter.ime.edit(input, { title: TW.i18n.t('PLACEHOLDER_OPEN') }, function () {});
      } else {
        this.openSelected();
      }
      return true;
    }
    return false;
  };

  P.handleGridKey = function (key) {
    var cols = TW.config.columns;
    var rows = Math.ceil(this.items.length / cols);
    var cellsInRow = function (y) { return Math.min(cols, this.items.length - y * cols); };

    if (key === KEY.LEFT && this.x > 0) { this.move(this.x - 1, this.y); return true; }
    if (key === KEY.RIGHT && this.x < cellsInRow.call(this, this.y) - 1) { this.move(this.x + 1, this.y); return true; }
    if (key === KEY.UP) {
      if (this.y > 0) { this.move(this.x, this.y - 1); } else { this.focusTopNav(); }
      return true;
    }
    if (key === KEY.DOWN && this.y < rows - 1 && this.x < cellsInRow.call(this, this.y + 1)) {
      this.move(this.x, this.y + 1); return true;
    }
    if (key === KEY.ENTER) { this.activate(); return true; }
    return false;
  };

  P.move = function (x, y) { this.removeFocus(); this.x = x; this.y = y; this.addFocus(); };

  P.activate = function () {
    var item = this.items[this.indexOfCursor()];
    if (!item) { return; }
    if (item.kind === 'game') {
      this.selectedGame = item;
      this.mode = MODE.GAMES_STREAMS;
      this.refresh();
    } else {
      TW.app.goToChannel(item.login);
    }
  };

  TW.BrowserScene = BrowserScene;
  TW.BrowserScene.MODE = MODE;
})(this);
