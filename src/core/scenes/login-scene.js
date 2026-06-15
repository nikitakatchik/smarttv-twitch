/*!
 * core/scenes/login-scene.js — Twitch login via the OAuth Device Code flow.
 *
 * Logged out: a Client-ID is configured (config.api.userClientId), so opening
 * this scene goes straight to the device code — show it big and poll while the
 * user approves it at twitch.tv/activate on a phone. A device-request error
 * shows a message with OK-to-retry. Logged in: show the account + a Log out
 * action. Reachable from the browser scene's account chip / Followed tab; BACK
 * returns to browse.
 *
 * There is no on-TV Client-ID entry: a custom or missing ID is a build-time
 * concern (set config.api.userClientId, or use the harness ?clientId= override)
 * — see docs/LOGIN.md.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var dom = TW.dom;
  var KEY = TW.KEY;

  function LoginScene(adapter) {
    this.adapter = adapter;
    this.view = 'pending';   // 'pending' | 'account'
    this.flowActive = false; // a device flow is in flight (survives nav in/out)
    this.errored = false;    // pending view is showing an error (OK retries)
  }

  var P = LoginScene.prototype;

  P.initialize = function () {
    var root = dom.create('div', 'tw-scene', '');
    root.id = 'tw-login';
    root.innerHTML =
      '<div class="tw-login-card">' +
        '<img class="tw-login-logo" src="assets/logo.png" alt="">' +
        '<div class="tw-login-title" id="tw-login-title"></div>' +
        '<div id="tw-login-pending">' +
          '<div class="tw-login-help" id="tw-login-pending-help"></div>' +
          '<div class="tw-login-code" id="tw-login-code"></div>' +
          '<div class="tw-login-or" id="tw-login-or"></div>' +
          '<div class="tw-login-qr" id="tw-login-qr"></div>' +
        '</div>' +
        '<div id="tw-login-account" style="display:none">' +
          '<div class="tw-login-help" id="tw-login-acct"></div>' +
          '<div class="tw-login-btn" id="tw-login-logout"></div>' +
        '</div>' +
        '<div class="tw-login-msg" id="tw-login-msg"></div>' +
      '</div>';
    (dom.get('app') || global.document.body).appendChild(root);
    this.root = root;

    dom.text(dom.get('tw-login-title'), TW.i18n.t('LOGIN_TITLE'));
    dom.text(dom.get('tw-login-logout'), TW.i18n.t('LOG_OUT'));
    dom.text(dom.get('tw-login-or'), TW.i18n.t('LOGIN_OR'));
    dom.hide(dom.get('tw-login-or'));
  };

  P.handleShow = function () { dom.show(this.root); };
  P.handleHide = function () { dom.hide(this.root); };

  P.handleFocus = function () {
    dom.text(dom.get('tw-login-msg'), '');
    if (TW.auth.isLoggedIn()) { this.showAccount(); return; }
    // A flow is already running (e.g. user navigated out and back) — re-show it.
    if (this.flowActive) { this.setView('pending'); return; }
    this.startFlow();
  };
  P.handleBlur = function () {};

  // --- views --------------------------------------------------------------
  P.setView = function (v) {
    this.view = v;
    dom.show(dom.get('tw-login-pending'), v === 'pending' ? 'block' : 'none');
    dom.show(dom.get('tw-login-account'), v === 'account' ? 'block' : 'none');
  };

  P.showAccount = function () {
    this.setView('account');
    var u = TW.auth.user() || {};
    dom.text(dom.get('tw-login-acct'), TW.i18n.t('LOGGED_IN_AS', u.display || u.login || '—'));
    dom.addClass(dom.get('tw-login-logout'), 'tw-focused');
  };

  // Render a QR of the activation URL into the pending view (scan -> the activate
  // page with the code prefilled). Degrades silently to just the code + URL text.
  P.renderQr = function (uri) {
    var el = dom.get('tw-login-qr'), orEl = dom.get('tw-login-or');
    if (!el) { return; }
    var qr = TW.qrcode && TW.qrcode(uri);
    if (!qr) { el.innerHTML = ''; dom.hide(el); dom.hide(orEl); return; }
    var html = '<table>', r, c;
    for (r = 0; r < qr.count; r++) {
      html += '<tr>';
      for (c = 0; c < qr.count; c++) { html += qr.isDark(r, c) ? '<td class="on"></td>' : '<td></td>'; }
      html += '</tr>';
    }
    el.innerHTML = html + '</table>';
    dom.show(el, 'inline-block'); // not the default 'block', which stretches the card full-width
    dom.show(orEl);
  };

  // Device request failed (or no Client-ID configured) — show the error in the
  // pending view; OK retries, BACK leaves.
  P.showError = function () {
    this.flowActive = false;
    this.errored = true;
    this.setView('pending');
    dom.text(dom.get('tw-login-code'), '');
    dom.text(dom.get('tw-login-pending-help'), '');
    dom.get('tw-login-qr').innerHTML = '';
    dom.hide(dom.get('tw-login-or'));
    dom.text(dom.get('tw-login-msg'), TW.i18n.t('LOGIN_ERR'));
  };

  // Start (or re-show) the device code flow using the configured Client-ID.
  P.startFlow = function () {
    var self = this;
    if (this.flowActive) { this.setView('pending'); return; }
    if (!TW.auth.clientId()) { this.showError(); return; }
    this.flowActive = true;
    this.errored = false;

    this.setView('pending');
    dom.text(dom.get('tw-login-msg'), '');
    dom.text(dom.get('tw-login-code'), '…');
    dom.text(dom.get('tw-login-pending-help'), '');
    dom.get('tw-login-qr').innerHTML = '';
    dom.hide(dom.get('tw-login-or'));

    TW.auth.startDeviceFlow(TW.auth.SCOPES, {
      onCode: function (info) {
        dom.text(dom.get('tw-login-pending-help'), TW.i18n.t('LOGIN_PENDING_HELP', info.verification_uri));
        dom.text(dom.get('tw-login-code'), info.user_code);
        self.renderQr(info.verification_uri);
      },
      onSuccess: function () {
        self.flowActive = false;
        // The poll outlives this scene; if the user navigated away (BACK), don't
        // yank them back when they approve later — the session is stored anyway.
        if (TW.sceneManager.focusedName() !== 'login') { return; }
        dom.text(dom.get('tw-login-msg'), TW.i18n.t('LOGIN_OK'));
        TW.app.goToBrowser(TW.BrowserScene.MODE.FOLLOWED);
      },
      onError: function () {
        self.flowActive = false;
        if (TW.sceneManager.focusedName() === 'login') { self.showError(); }
      }
    });
  };

  P.doLogout = function () {
    TW.auth.logout(function () { TW.app.goToBrowser(TW.BrowserScene.MODE.ALL); });
  };

  // --- keys ---------------------------------------------------------------
  P.handleKeyDown = function (key) {
    if (key === KEY.BACK) { TW.app.goToBrowser(); return true; }
    if (this.view === 'account') {
      if (key === KEY.ENTER) { this.doLogout(); }
      return true;
    }
    // pending: OK retries after an error; otherwise swallow all but BACK.
    if (key === KEY.ENTER && this.errored) { this.startFlow(); }
    return true;
  };

  TW.LoginScene = LoginScene;
})(this);
