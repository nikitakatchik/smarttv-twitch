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
    this.onChip = false;       // account chip focused (above the grid)
    this.pendingMode = null;   // mode to enter on next focus (e.g. after login)
  }

  var P = BrowserScene.prototype;

  P.initialize = function () {
    var root = dom.create('div', 'tw-scene', '');
    root.id = 'tw-browser';
    root.innerHTML =
      '<div class="tw-topbar">' +
        '<img class="tw-logo" src="assets/logo.png" alt="">' +
        '<span class="tw-wordmark">' + dom.escape(TW.config.appName) + '</span>' +
        '<div class="tw-account" id="tw-account">&#9679; <span id="tw-acct-label"></span></div>' +
        '<div class="tw-tips">' +
          '<span class="tw-tip" id="tw-tip-all"><b class="tw-dot tw-red">A</b> <span id="tw-l-all"></span></span>' +
          '<span class="tw-tip" id="tw-tip-games"><b class="tw-dot tw-green">B</b> <span id="tw-l-games"></span></span>' +
          '<span class="tw-tip" id="tw-tip-followed"><b class="tw-dot tw-yellow">C</b> <span id="tw-l-followed"></span></span>' +
          '<span class="tw-tip" id="tw-tip-open"><b class="tw-dot tw-blue">D</b> <span id="tw-l-open"></span></span>' +
        '</div>' +
      '</div>' +
      '<div class="tw-loading" id="tw-b-loading"><div class="tw-spinner"><i></i><i></i><i></i></div>' +
        '<div class="tw-loading-text" id="tw-b-loading-text"></div></div>' +
      '<div class="tw-grid-wrap" id="tw-grid-wrap"><table class="tw-grid" id="tw-grid"></table></div>' +
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
  P.handleShow = function () { dom.show(this.root); };
  P.handleHide = function () { dom.hide(this.root); this.clean(); };
  P.handleFocus = function () {
    this.updateAccount();
    this.onChip = false;
    dom.removeClass(dom.get('tw-account'), 'tw-focused');
    var m = (this.pendingMode == null) ? MODE.ALL : this.pendingMode;
    this.pendingMode = null;
    this.switchMode(m, true);
  };
  P.handleBlur = function () {};

  // --- data ---------------------------------------------------------------
  P.showDialog = function (text) {
    dom.hide(dom.get('tw-grid-wrap'));
    dom.hide(dom.get('tw-open'));
    dom.text(dom.get('tw-b-loading-text'), text || '');
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
  };

  P.refresh = function () {
    if (this.mode === MODE.OPEN) { return; }
    this.clean();
    this.loadData();
  };

  P.loadData = function () {
    if (this.loading || this.cursor === false) { return; }
    this.loading = true;
    if (this.items.length === 0) { this.showDialog(TW.i18n.t('LOADING')); }

    var self = this;
    var cursor = this.cursor || null;
    var onOk = function (result) { self.onPage(result); };
    var onFail = function () {
      self.loading = false;
      if (self.items.length === 0) { self.showDialog(TW.i18n.t('ERROR_LOAD')); }
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
    if (this.cells.length && !this.focusedCell()) { this.x = 0; this.y = 0; this.addFocus(); }
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
    var td = dom.create('td', 'tw-cell');
    var isGame = item.kind === 'game';
    var img = isGame ? item.box : item.thumb;
    var title = isGame ? item.display : dom.escape(item.title || item.display);
    var sub1 = isGame ? '' : dom.escape(item.display);
    var sub2 = TW.addCommas(item.viewers) + ' ' + TW.i18n.t('VIEWERS');
    td.innerHTML =
      '<div class="tw-cell-inner' + (isGame ? ' tw-cell-game' : '') + '">' +
        '<img class="tw-thumb" src="' + img + '">' +
        '<div class="tw-meta">' +
          '<div class="tw-meta-title">' + title + '</div>' +
          (sub1 ? '<div class="tw-meta-sub">' + sub1 + '</div>' : '') +
          '<div class="tw-meta-sub">' + sub2 + '</div>' +
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
    if (c.scrollIntoView) { c.scrollIntoView(false); }
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
    this.onChip = false;
    dom.removeClass(dom.get('tw-account'), 'tw-focused');
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
      if (this.mode === MODE.GAMES_STREAMS) { this.switchMode(MODE.GAMES, true); return true; }
      if (this.adapter.system && this.adapter.system.exit) { this.adapter.system.exit(); return true; }
      return false;
    }
    // Colour buttons switch tabs; pressing the active tab again force-refreshes.
    if (key === KEY.RED) { this.switchMode(MODE.ALL, this.mode === MODE.ALL); return true; }
    if (key === KEY.GREEN) { this.switchMode(MODE.GAMES, this.mode === MODE.GAMES); return true; }
    if (key === KEY.YELLOW) { this.switchMode(MODE.FOLLOWED, this.mode === MODE.FOLLOWED); return true; }
    if (key === KEY.BLUE) { this.switchMode(MODE.OPEN); return true; }

    if (this.onChip) { return this.handleChipKey(key); }
    if (this.loading && this.mode !== MODE.OPEN) { return true; }

    if (this.mode === MODE.OPEN) { return this.handleOpenKey(key); }
    return this.handleGridKey(key);
  };

  // --- account chip (above the grid) --------------------------------------
  P.focusChip = function () {
    this.removeFocus();
    this.onChip = true;
    dom.addClass(dom.get('tw-account'), 'tw-focused');
  };

  P.handleChipKey = function (key) {
    if (key === KEY.DOWN) {
      this.onChip = false;
      dom.removeClass(dom.get('tw-account'), 'tw-focused');
      this.addFocus();
      return true;
    }
    if (key === KEY.ENTER) { TW.app.goToLogin(); return true; }
    return true;
  };

  P.handleOpenKey = function (key) {
    if (key === KEY.UP) { this.openCursor = 0; this.refreshOpenFocus(); return true; }
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
      if (this.y > 0) { this.move(this.x, this.y - 1); } else { this.focusChip(); }
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
