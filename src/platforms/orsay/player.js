/*!
 * platforms/orsay/player.js — pre-Tizen INFOLINK player adapter (2013–2014).
 *
 * The legacy <object classid="clsid:SAMSUNG-INFOLINK-PLAYER"> plugin plays HLS
 * when you append "|COMPONENT=HLS" to the .m3u8 URL. Its event callbacks are a
 * Samsung peculiarity: they are assigned as STRING names of GLOBAL functions
 * (the native plugin eval()s the string in global scope), NOT function
 * references — so the handlers live on a global TW.orsayEvents object.
 *
 * Quality is handled conservatively. Twitch often lists the highest rendition
 * first, but older INFOLINK builds are more likely to handle mid-tier streams,
 * so Orsay drops high-frame-rate renditions and ranks the rest as:
 * 720p > 480p > 360p > 1080p > everything else.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  // The single active player's callbacks, referenced by the global handlers.
  var active = null;

  function trace(msg) {
    if (TW.log && TW.log.info) { TW.log.info('orsay player: ' + msg); }
  }

  function warn(msg) {
    if (TW.log && TW.log.warn) { TW.log.warn('orsay player: ' + msg); }
  }

  function shortUrl(url) {
    var s = String(url || '');
    var q = s.indexOf('?');
    if (q >= 0) { s = s.substring(0, q); }
    return s.length > 120 ? (s.substring(0, 117) + '...') : s;
  }

  function toNativeHlsUrl(url) {
    var s = String(url || '');
    var m = /^https:\/\/([^\/?#]+)/i.exec(s);
    var host = m && m[1] ? m[1].toLowerCase() : '';
    if (host === 'usher.ttvnw.net' || /\.ttvnw\.net$/.test(host)) {
      return 'http://' + s.substring('https://'.length);
    }
    return s;
  }

  function methodList(plugin) {
    return 'play=' + !!(plugin && plugin.Play) +
      ' stop=' + !!(plugin && plugin.Stop) +
      ' display=' + !!(plugin && plugin.SetDisplayArea);
  }

  function heightOf(v) {
    var m;
    if (v && v.resolution) {
      m = /x(\d+)/.exec(v.resolution);
      if (m) { return parseInt(m[1], 10) || 0; }
    }
    m = /(\d+)p/.exec(String((v && v.name) || '').toLowerCase());
    return m ? (parseInt(m[1], 10) || 0) : 0;
  }

  function frameRateOf(v) {
    var f = v && v.frameRate ? parseFloat(v.frameRate) : 0;
    var label = String((v && v.name) || '').toLowerCase();
    var m = /p(\d+)/.exec(label);
    if (m) { f = Math.max(f || 0, parseInt(m[1], 10) || 0); }
    return f || 0;
  }

  function legacyRank(v) {
    var h = heightOf(v);
    if (!v || !v.url) { return 99; }
    if (frameRateOf(v) > 30) { return 99; }
    if (h === 720) { return 10; }
    if (h === 480) { return 20; }
    if (h === 360) { return 30; }
    if (h === 1080) { return 40; }
    return 50;
  }

  function variantLabel(v) {
    return (v && (v.name || v.resolution || v.url)) || '';
  }

  function legacyVariants(list) {
    var out = [];
    for (var i = 0; i < (list || []).length; i++) {
      var v = list[i];
      var rank = legacyRank(v);
      if (rank >= 90) { continue; }
      out.push({
        name: v.name || v.resolution || ('q' + i),
        url: v.url,
        bandwidth: v.bandwidth || 0,
        resolution: v.resolution || '',
        frameRate: v.frameRate || 0,
        rank: rank,
        order: i
      });
    }
    out.sort(function (a, b) {
      if (a.rank !== b.rank) { return a.rank - b.rank; }
      return a.order - b.order;
    });
    return out;
  }

  function failPlayer(cb, msg) {
    try { cb.onError(msg || TW.i18n.t('ERROR_RENDER')); } catch (e) {}
  }

  function noopPlayer(cb) {
    return {
      load: function () { failPlayer(cb, TW.i18n.t('ERROR_RENDER')); },
      stop: function () {},
      destroy: function () {},
      setDisplayArea: function () {},
      getQualities: function (fn) { fn(['Auto']); },
      selectQuality: function () {},
      canSeek: function () { return false; },
      getPosition: function () { return 0; },
      getDuration: function () { return 0; },
      seekTo: function () {},
      pause: function () {},
      resume: function () {}
    };
  }

  function noteNativeEvent() {
    if (active && active.markEvent) { active.markEvent(); }
  }

  function handleNativeError(label, message) {
    noteNativeEvent();
    warn('event ' + label);
    if (active && active.onNativeError && active.onNativeError(label, message)) { return; }
    if (active) { active.cb.onError(message); }
  }

  // Global event router — referenced by string name from the plugin.
  TW.orsayEvents = {
    onBufferingStart: function () {
      noteNativeEvent();
      trace('event buffering start');
      if (active) { active.cb.onBufferingStart(); }
    },
    onBufferingProgress: function (pct) {
      noteNativeEvent();
      if (pct === 0 || pct === 25 || pct === 50 || pct === 75 || pct === 100) {
        trace('event buffering progress ' + pct);
      }
      if (active) { active.cb.onBufferingProgress(pct); }
    },
    onBufferingComplete: function () {
      noteNativeEvent();
      trace('event buffering complete');
      if (active) { active.cb.onBufferingComplete(); }
    },
    onStreamInfoReady: function () {
      noteNativeEvent();
      trace('event stream info ready');
      if (active) {
        if (active.markPlaying) { active.markPlaying(); }
        active.cb.onPlaying();
      }
    },
    onRenderingComplete: function () {
      noteNativeEvent();
      trace('event rendering complete');
      if (active) { active.cb.onEnded(); }
    },
    onConnectionFailed: function () {
      handleNativeError('connection failed', TW.i18n.t('ERROR_NETWORK'));
    },
    onNetworkDisconnected: function () {
      handleNativeError('network disconnected', TW.i18n.t('ERROR_NETWORK'));
    },
    onStreamNotFound: function () {
      handleNativeError('stream not found', TW.i18n.t('ERROR_NOT_FOUND'));
    },
    onAuthenticationFailed: function () {
      handleNativeError('authentication failed', TW.i18n.t('ERROR_TOKEN'));
    },
    onRenderError: function () {
      handleNativeError('render error', TW.i18n.t('ERROR_RENDER'));
    }
  };

  function hls(url) { return url.indexOf('.m3u8') >= 0 ? (url + '|COMPONENT=HLS') : url; }

  function createPlayer(cb) {
    var plugin = TW.dom.get('tw-orsay-player');
    var master = null;
    var defaultUrl = null;
    var variants = [];
    var qualities = ['Auto'];
    var qcb = null;
    var loadToken = 0;
    var playAttempt = 0;
    var candidateIndex = -1;
    var attemptEventSeen = false;
    var playing = false;
    var rect = null;

    trace('create ' + methodList(plugin));
    if (!plugin) {
      warn('INFOLINK object missing');
      return noopPlayer(cb);
    }

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
      var nativeUrl = toNativeHlsUrl(url);
      var playable = hls(nativeUrl);
      if (nativeUrl !== url) { trace('native url ' + shortUrl(nativeUrl)); }
      trace('Play ' + shortUrl(playable));
      try { plugin.Stop(); } catch (e) { warn('Stop before Play failed: ' + e); }
      try {
        plugin.Play(playable);
        trace('Play returned');
        return null;
      } catch (e2) {
        warn('Play threw: ' + e2);
        return String(e2);
      }
    }

    function rebuildQualities() {
      qualities = ['Auto'];
      for (var i = 0; i < variants.length; i++) { qualities.push(variants[i].name); }
      if (qcb) { qcb(qualities); }
    }

    function hasSeek() {
      return !!(plugin && (plugin.SeekTo || plugin.JumpTo || plugin.Seek));
    }

    function startPlayback(url, index, reason) {
      var attempt = ++playAttempt;
      var err;
      candidateIndex = index;
      attemptEventSeen = false;
      playing = false;
      if (reason) { trace(reason); }
      err = play(url);
      if (err) {
        if (!tryFallback('play threw', err)) { failPlayer(cb, err); }
        return;
      }
      if (global.setTimeout) {
        global.setTimeout(function () {
          if (attempt === playAttempt && active && !attemptEventSeen && !playing) {
            if (!tryFallback('no native callback after Play', TW.i18n.t('ERROR_RENDER'))) {
              warn('no native callback after Play');
            }
          }
        }, 12000);
      }
    }

    function tryFallback(reason, message) {
      var next;
      if (playing) { return false; }
      next = candidateIndex + 1;
      if (next < 0) { next = 0; }
      if (next >= variants.length) { return false; }
      trace('fallback after ' + reason + ' to ' + variantLabel(variants[next]));
      startPlayback(variants[next].url, next, null);
      return true;
    }

    var api = {
      load: function (masterUrl) {
        var token = ++loadToken;
        var eventSeen = false;
        var nativeMaster = toNativeHlsUrl(masterUrl);
        trace('load master ' + shortUrl(masterUrl));
        if (nativeMaster !== masterUrl) { trace('native master ' + shortUrl(nativeMaster)); }
        active = {
          cb: cb,
          markEvent: function () {
            eventSeen = true;
            attemptEventSeen = true;
          },
          markPlaying: function () { playing = true; },
          onNativeError: function (label, message) {
            return tryFallback(label, message);
          }
        };
        master = nativeMaster;
        defaultUrl = nativeMaster;
        variants = [];
        rebuildQualities();
        startPlayback(nativeMaster, -1, null);
        if (!TW.api || !TW.api.fetchVariants) {
          trace('fetch variants skipped');
          return;
        }
        // Parse renditions in the background, but keep only safer legacy
        // qualities. Do not let Twitch's first/highest rendition become the
        // implicit choice; the 5.1 emulator has already rejected that path.
        trace('fetch variants start');
        TW.api.fetchVariants(nativeMaster, function (list) {
          if (token !== loadToken || !active) { return; }
          variants = legacyVariants(list || []);
          trace('fetch variants ok count=' + ((list && list.length) || 0) +
            ' legacy=' + variants.length);
          if (variants.length) {
            trace('legacy variants ' + variantLabel(variants[0]) +
              (variants[1] ? (', ' + variantLabel(variants[1])) : ''));
            defaultUrl = variants[0].url;
          }
          rebuildQualities();
          if (!eventSeen && variants.length) {
            startPlayback(variants[0].url, 0, 'switch to legacy variant ' + variantLabel(variants[0]));
          }
        }, function () {
          if (token !== loadToken || !active) { return; }
          trace('fetch variants failed');
          rebuildQualities();
        });
      },
      stop: function () {
        loadToken++;
        playAttempt++;
        trace('stop');
        try { plugin.Stop(); } catch (e) { warn('Stop failed: ' + e); }
        active = null;
      },
      destroy: function () { this.stop(); },
      setDisplayArea: function (x, y, w, h) {
        var next = x + ',' + y + ',' + w + 'x' + h;
        if (rect !== next) {
          rect = next;
          trace('display rect ' + next);
        }
        try { plugin.SetDisplayArea(x, y, w, h); }
        catch (e) { warn('SetDisplayArea failed: ' + e); }
      },
      getQualities: function (fn) { qcb = fn; fn(qualities); },
      selectQuality: function (i) {
        if (i <= 0) {
          trace('select quality Auto');
          startPlayback(defaultUrl || master, variants.length ? 0 : -1, null);
        } else if (variants[i - 1]) {
          trace('select quality ' + variantLabel(variants[i - 1]));
          startPlayback(variants[i - 1].url, i - 1, null);
        }
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
      },
      pause: function () {
        try { if (plugin.Pause) { plugin.Pause(); } } catch (e) {}
      },
      resume: function () {
        try {
          if (plugin.Resume) { plugin.Resume(); }
          else if (plugin.PlayResume) { plugin.PlayResume(); }
        } catch (e) {}
      }
    };
    return api;
  }

  TW.platform.createPlayer = createPlayer;
})(this);
