/*!
 * platforms/tizen/player.js — Tizen AVPlay adapter (2015+).
 *
 * HTML5 <video> can't play HLS on Tizen, so live streams go through
 * webapis.avplay: open -> setDisplayRect -> setListener -> prepareAsync ->
 * play. Because AVPlay is a NATIVE player it sends no browser Origin header,
 * so it plays the usher master URL directly. Quality comes
 * from AVPlay's own track list (getTotalTrackInfo / setSelectTrack), so we
 * never have to fetch the playlist from the CORS-enforcing WebView.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  var NATIVE_WIDTH = 1920;
  var NATIVE_HEIGHT = 1080;

  function avplay() { return global.webapis && global.webapis.avplay; }

  function logicalScreen() {
    return (TW.config && TW.config.screen) || { width: 1280, height: 720 };
  }

  function setNativeDisplayRect(av, x, y, w, h) {
    var s = logicalScreen();
    var sx = NATIVE_WIDTH / (s.width || 1280);
    var sy = NATIVE_HEIGHT / (s.height || 720);
    av.setDisplayRect(
      Math.round((x || 0) * sx),
      Math.round((y || 0) * sy),
      Math.round((w || 0) * sx),
      Math.round((h || 0) * sy)
    );
  }

  function labelFromTrack(t) {
    try {
      var info = JSON.parse(t.extra_info);
      if (info.Height) { return info.Height + 'p'; }
      if (info.Bit_rate) { return Math.round(parseInt(info.Bit_rate, 10) / 1000) + 'k'; }
    } catch (e) {}
    return 'track ' + t.index;
  }

  function createPlayer(cb) {
    var av = avplay();
    var qualities = ['Auto'];
    var trackIndex = [-1];     // quality index -> AVPlay VIDEO track index
    var qcb = null;

    function buildQualities() {
      qualities = ['Auto']; trackIndex = [-1];
      try {
        var tracks = av.getTotalTrackInfo();
        for (var i = 0; i < tracks.length; i++) {
          if (tracks[i].type === 'VIDEO') {
            qualities.push(labelFromTrack(tracks[i]));
            trackIndex.push(tracks[i].index);
          }
        }
      } catch (e) { TW.log.warn('getTotalTrackInfo: ' + e); }
      if (qcb) { qcb(qualities); }
    }

    return {
      load: function (masterUrl) {
        try {
          av.open(masterUrl);
          setNativeDisplayRect(av, 0, 0, logicalScreen().width, logicalScreen().height);
          try {
            av.setStreamingProperty('ADAPTIVE_INFO', 'STARTBITRATE=HIGHEST|SKIPBITRATE=LOWEST');
          } catch (e) {}
          av.setListener({
            onbufferingstart: function () { cb.onBufferingStart(); },
            onbufferingprogress: function (p) { cb.onBufferingProgress(p); },
            onbufferingcomplete: function () { cb.onBufferingComplete(); cb.onPlaying(); },
            onstreamcompleted: function () { cb.onEnded(); },
            oncurrentplaytime: function () {},
            onevent: function (type, data) { TW.log.info('avplay event ' + type + ' ' + data); },
            onerror: function (type) { cb.onError(TW.i18n.t('ERROR_RENDER') + ' (' + type + ')'); },
            onerrormsg: function (type, msg) { cb.onError(msg || TW.i18n.t('ERROR_RENDER')); }
          });
          av.prepareAsync(function () { buildQualities(); av.play(); },
            function (err) { cb.onError(TW.i18n.t('ERROR_TOKEN') + ' (' + err + ')'); });
        } catch (e) {
          cb.onError(String(e));
        }
      },
      stop: function () { try { av.stop(); av.close(); } catch (e) {} },
      destroy: function () { this.stop(); },
      setDisplayArea: function (x, y, w, h) { try { setNativeDisplayRect(av, x, y, w, h); } catch (e) {} },
      getQualities: function (fn) { qcb = fn; fn(qualities); },
      selectQuality: function (i) {
        try { if (i > 0 && trackIndex[i] != null) { av.setSelectTrack('VIDEO', trackIndex[i]); } }
        catch (e) { TW.log.warn('setSelectTrack: ' + e); }
      },
      canSeek: function () { return true; },
      getPosition: function () {
        try { return (av.getCurrentTime() || 0) / 1000; } catch (e) { return 0; }
      },
      getDuration: function () {
        try { return (av.getDuration() || 0) / 1000; } catch (e) { return 0; }
      },
      seekTo: function (seconds) {
        try { av.seekTo(Math.max(0, Math.floor((seconds || 0) * 1000))); }
        catch (e) { TW.log.warn('seekTo: ' + e); }
      },
      pause: function () { try { av.pause(); } catch (e) {} },
      resume: function () { try { av.play(); } catch (e) {} }
    };
  }

  TW.platform.createPlayer = createPlayer;
})(this);
