/*!
 * platforms/orsay/player.js — pre-Tizen INFOLINK player adapter (2013–2014).
 *
 * The legacy <object classid="clsid:SAMSUNG-INFOLINK-PLAYER"> plugin plays HLS
 * when you append "|COMPONENT=HLS" to the .m3u8 URL. Its event callbacks are a
 * Samsung peculiarity: they are assigned as STRING names of GLOBAL functions
 * (the native plugin eval()s the string in global scope), NOT function
 * references — so the handlers live on a global TW.orsayEvents object.
 *
 * Quality is handled by parsing the master playlist ourselves (the INFOLINK
 * player picks no rendition for us): "Auto" plays the master, a specific
 * quality plays that variant's media-playlist URL.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  // The single active player's callbacks, referenced by the global handlers.
  var active = null;

  // Global event router — referenced by string name from the plugin.
  TW.orsayEvents = {
    onBufferingStart: function () { if (active) { active.cb.onBufferingStart(); } },
    onBufferingProgress: function (pct) { if (active) { active.cb.onBufferingProgress(pct); } },
    onBufferingComplete: function () { if (active) { active.cb.onBufferingComplete(); } },
    onStreamInfoReady: function () { if (active) { active.cb.onPlaying(); } },
    onRenderingComplete: function () { if (active) { active.cb.onEnded(); } },
    onConnectionFailed: function () { if (active) { active.cb.onError(TW.i18n.t('ERROR_NETWORK')); } },
    onNetworkDisconnected: function () { if (active) { active.cb.onError(TW.i18n.t('ERROR_NETWORK')); } },
    onStreamNotFound: function () { if (active) { active.cb.onError(TW.i18n.t('ERROR_NOT_FOUND')); } },
    onAuthenticationFailed: function () { if (active) { active.cb.onError(TW.i18n.t('ERROR_TOKEN')); } },
    onRenderError: function () { if (active) { active.cb.onError(TW.i18n.t('ERROR_RENDER')); } }
  };

  function hls(url) { return url.indexOf('.m3u8') >= 0 ? (url + '|COMPONENT=HLS') : url; }

  function createPlayer(cb) {
    var plugin = TW.dom.get('tw-orsay-player');
    var master = null;
    var variants = [];
    var qualities = ['Auto'];
    var qcb = null;

    // Wire the plugin's string-named handlers (must be global paths).
    plugin.OnBufferingStart = 'TW.orsayEvents.onBufferingStart';
    plugin.OnBufferingProgress = 'TW.orsayEvents.onBufferingProgress';
    plugin.OnBufferingComplete = 'TW.orsayEvents.onBufferingComplete';
    plugin.OnStreamInfoReady = 'TW.orsayEvents.onStreamInfoReady';
    plugin.OnRenderingComplete = 'TW.orsayEvents.onRenderingComplete';
    plugin.OnConnectionFailed = 'TW.orsayEvents.onConnectionFailed';
    plugin.OnNetworkDisconnected = 'TW.orsayEvents.onNetworkDisconnected';
    plugin.OnStreamNotFound = 'TW.orsayEvents.onStreamNotFound';
    plugin.OnAuthenticationFailed = 'TW.orsayEvents.onAuthenticationFailed';
    plugin.OnRenderError = 'TW.orsayEvents.onRenderError';

    function play(url) {
      try { plugin.Stop(); } catch (e) {}
      plugin.Play(hls(url));
    }

    function hasSeek() {
      return !!(plugin && (plugin.SeekTo || plugin.JumpTo || plugin.Seek));
    }

    var api = {
      load: function (masterUrl) {
        active = { cb: cb };
        master = masterUrl;
        play(masterUrl);
        // Parse renditions for the quality menu (best-effort).
        TW.api.fetchVariants(masterUrl, function (list) {
          variants = list || [];
          qualities = ['Auto'];
          for (var i = 0; i < variants.length; i++) { qualities.push(variants[i].name); }
          if (qcb) { qcb(qualities); }
        }, function () { if (qcb) { qcb(qualities); } });
      },
      stop: function () { try { plugin.Stop(); } catch (e) {} active = null; },
      destroy: function () { this.stop(); },
      setDisplayArea: function (x, y, w, h) { try { plugin.SetDisplayArea(x, y, w, h); } catch (e) {} },
      getQualities: function (fn) { qcb = fn; fn(qualities); },
      selectQuality: function (i) {
        if (i <= 0) { play(master); }
        else if (variants[i - 1]) { play(variants[i - 1].url); }
      },
      canSeek: function () { return hasSeek(); },
      getPosition: function () {
        try {
          if (plugin.GetPlayingTime) { return (plugin.GetPlayingTime() || 0) / 1000; }
          if (plugin.GetCurrentPlayTime) { return (plugin.GetCurrentPlayTime() || 0) / 1000; }
        } catch (e) {}
        return 0;
      },
      getDuration: function () {
        try { if (plugin.GetDuration) { return (plugin.GetDuration() || 0) / 1000; } } catch (e) {}
        return 0;
      },
      seekTo: function (seconds) {
        var ms = Math.max(0, Math.floor((seconds || 0) * 1000));
        try {
          if (plugin.SeekTo) { plugin.SeekTo(ms); }
          else if (plugin.JumpTo) { plugin.JumpTo(ms); }
          else if (plugin.Seek) { plugin.Seek(ms); }
        } catch (e) { TW.log.warn('seekTo: ' + e); }
      }
    };
    return api;
  }

  TW.platform.createPlayer = createPlayer;
})(this);
