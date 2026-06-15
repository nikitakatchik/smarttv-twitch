/*!
 * core/scenes/login-scene.js — Twitch login via the device code flow.
 *
 * Logged out: the user enters their Twitch app Client-ID (see docs/LOGIN.md),
 * we request a device code and show it big; they approve it at
 * twitch.tv/activate on a phone while we poll. Logged in: shows the account and
 * a Log out action. Reachable from the browser scene's account chip / Followed
 * tab; BACK returns to browse.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  var dom = TW.dom;
  var KEY = TW.KEY;

  function LoginScene(adapter) {
    this.adapter = adapter;
    this.view = 'form';     // 'form' | 'pending' | 'account'
    this.focusIdx = 0;      // form: 0 input, 1 button
  }

  var P = LoginScene.prototype;

  P.initialize = function () {
    var root = dom.create('div', 'tw-scene', '');
    root.id = 'tw-login';
    root.innerHTML =
      '<div class="tw-login-card">' +
        '<img class="tw-login-logo" src="assets/logo.png" alt="">' +
        '<div class="tw-login-title" id="tw-login-title"></div>' +
        '<div id="tw-login-form">' +
          '<div class="tw-login-help" id="tw-login-help"></div>' +
          '<input class="tw-login-input" id="tw-login-cid" type="text">' +
          '<div class="tw-login-btn" id="tw-login-go"></div>' +
          '<div class="tw-login-hint" id="tw-login-hint"></div>' +
        '</div>' +
        '<div id="tw-login-pending" style="display:none">' +
          '<div class="tw-login-help" id="tw-login-pending-help"></div>' +
          '<div class="tw-login-code" id="tw-login-code"></div>' +
          '<div class="tw-login-uri" id="tw-login-uri"></div>' +
          '<div class="tw-spinner"></div>' +
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
    dom.text(dom.get('tw-login-help'), TW.i18n.t('LOGIN_HELP'));
    dom.text(dom.get('tw-login-go'), TW.i18n.t('LOG_IN'));
    dom.text(dom.get('tw-login-hint'), TW.i18n.t('LOGIN_HINT'));
    dom.text(dom.get('tw-login-logout'), TW.i18n.t('LOG_OUT'));
    dom.attr(dom.get('tw-login-cid'), 'placeholder', TW.i18n.t('LOGIN_CLIENT_ID'));
  };

  P.handleShow = function () { dom.show(this.root); };
  P.handleHide = function () { dom.hide(this.root); };

  P.handleFocus = function () {
    dom.text(dom.get('tw-login-msg'), '');
    if (TW.auth.isLoggedIn()) { this.showAccount(); } else { this.showForm(); }
  };
  P.handleBlur = function () {};

  // --- views --------------------------------------------------------------
  P.setView = function (v) {
    this.view = v;
    dom.show(dom.get('tw-login-form'), v === 'form' ? 'block' : 'none');
    dom.show(dom.get('tw-login-pending'), v === 'pending' ? 'block' : 'none');
    dom.show(dom.get('tw-login-account'), v === 'account' ? 'block' : 'none');
  };

  P.showForm = function () {
    this.setView('form');
    var cid = dom.get('tw-login-cid');
    if (cid && !cid.value) { cid.value = TW.auth.clientId() || ''; }
    this.focusIdx = 0;
    this.renderFormFocus();
  };

  P.renderFormFocus = function () {
    dom.removeClass(dom.get('tw-login-cid'), 'tw-focused');
    dom.removeClass(dom.get('tw-login-go'), 'tw-focused');
    dom.addClass(this.focusIdx === 0 ? dom.get('tw-login-cid') : dom.get('tw-login-go'), 'tw-focused');
  };

  P.showAccount = function () {
    this.setView('account');
    var u = TW.auth.user() || {};
    dom.text(dom.get('tw-login-acct'), TW.i18n.t('LOGGED_IN_AS', u.display || u.login || '—'));
    dom.addClass(dom.get('tw-login-logout'), 'tw-focused');
  };

  P.startFlow = function () {
    var self = this;
    var val = (dom.get('tw-login-cid').value || '').replace(/^\s+|\s+$/g, '');
    if (!val) { dom.text(dom.get('tw-login-msg'), TW.i18n.t('LOGIN_NO_CLIENT')); return; }
    TW.auth.setClientId(val);

    this.setView('pending');
    dom.text(dom.get('tw-login-code'), '…');
    dom.text(dom.get('tw-login-uri'), '');
    dom.text(dom.get('tw-login-pending-help'), '');

    TW.auth.startDeviceFlow(TW.auth.SCOPES, {
      onCode: function (info) {
        dom.text(dom.get('tw-login-pending-help'), TW.i18n.t('LOGIN_PENDING_HELP', info.verification_uri));
        dom.text(dom.get('tw-login-code'), info.user_code);
        dom.text(dom.get('tw-login-uri'), info.verification_uri);
      },
      onSuccess: function () {
        dom.text(dom.get('tw-login-msg'), TW.i18n.t('LOGIN_OK'));
        TW.app.goToBrowser(TW.BrowserScene.MODE.FOLLOWED);
      },
      onError: function (reason) {
        self.showForm();
        dom.text(dom.get('tw-login-msg'),
          reason === 'no-client-id' ? TW.i18n.t('LOGIN_NO_CLIENT') : TW.i18n.t('LOGIN_ERR'));
      }
    });
  };

  P.doLogout = function () {
    var self = this;
    TW.auth.logout(function () { self.showForm(); dom.text(dom.get('tw-login-msg'), TW.i18n.t('LOGGED_OUT')); });
  };

  // --- keys ---------------------------------------------------------------
  P.handleKeyDown = function (key) {
    if (key === KEY.BACK) { TW.app.goToBrowser(); return true; }

    if (this.view === 'form') {
      if (key === KEY.UP) { this.focusIdx = 0; this.renderFormFocus(); return true; }
      if (key === KEY.DOWN) { this.focusIdx = 1; this.renderFormFocus(); return true; }
      if (key === KEY.ENTER) {
        if (this.focusIdx === 0 && this.adapter.ime && this.adapter.ime.edit) {
          this.adapter.ime.edit(dom.get('tw-login-cid'), { title: TW.i18n.t('LOGIN_CLIENT_ID') }, function () {});
        } else { this.startFlow(); }
        return true;
      }
      return true;
    }
    if (this.view === 'account') {
      if (key === KEY.ENTER) { this.doLogout(); return true; }
      return true;
    }
    // pending: swallow everything but BACK (handled above)
    return true;
  };

  TW.LoginScene = LoginScene;
})(this);
