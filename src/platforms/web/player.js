/*!
 * platforms/web/player.js — desktop harness player (hls.js + native Safari HLS).
 *
 * This is the "TV" you can run on a laptop. It implements the same player
 * contract the TV adapters do, so the channel scene can't tell the difference.
 * Browsers enforce a CORS policy that native TV players don't, and Twitch's
 * usher/playlist hosts don't send Access-Control-Allow-Origin for arbitrary
 * origins — so the harness routes the HLS master URL through the dev server's
 * CORS proxy (TW.platform.proxyBase), whose playlist rewriting then carries the
 * whole variant/segment chain back through itself. DEV-ONLY: real TV players
 * play the usher URL directly.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  function labelFor(level, idx) {
    if (level.height) {
      var fr = level.frameRate || (level.attrs && parseFloat(level.attrs['FRAME-RATE']));
      return level.height + 'p' + (fr && fr > 35 ? Math.round(fr) : '');
    }
    if (level.bitrate) { return Math.round(level.bitrate / 1000) + 'k'; }
    return 'q' + idx;
  }

  function createPlayer(cb) {
    var Hls = global.Hls;
    var video = TW.dom.get('tw-video');
    var hls = null;
    var qualities = ['Auto'];
    var levelMap = [-1];        // quality index -> hls level index (-1 = auto)
    var qcb = null;
    var baseW = 0, baseH = 0;

    function publishQualities() {
      if (qcb) { qcb(qualities); }
    }

    function displayBase() {
      if (!baseW || !baseH) {
        var p = video.parentNode;
        baseW = (p && p.offsetWidth) || video.offsetWidth || TW.config.screen.width;
        baseH = (p && p.offsetHeight) || video.offsetHeight || TW.config.screen.height;
      }
    }

    function setVideoRect(x, y, w, h) {
      displayBase();
      video.style.position = 'absolute';
      video.style.left = Math.round(x * baseW / TW.config.screen.width) + 'px';
      video.style.top = Math.round(y * baseH / TW.config.screen.height) + 'px';
      video.style.width = Math.round(w * baseW / TW.config.screen.width) + 'px';
      video.style.height = Math.round(h * baseH / TW.config.screen.height) + 'px';
      video.style.objectFit = 'contain';
    }

    TW.dom.on(video, 'waiting', function () { cb.onBufferingStart(); });
    TW.dom.on(video, 'playing', function () { cb.onBufferingComplete(); cb.onPlaying(); });
    TW.dom.on(video, 'ended', function () { cb.onEnded(); });

    // Dev-only: route the HLS chain through the dev server's CORS proxy.
    function viaProxy(url) {
      var base = TW.platform.proxyBase;
      return base ? base.replace(/\/$/, '') + '/proxy?url=' + encodeURIComponent(url) : url;
    }

    function seekStart() {
      try { if (video.seekable && video.seekable.length) { return video.seekable.start(0) || 0; } } catch (e) {}
      return 0;
    }

    function seekEnd() {
      try { if (video.seekable && video.seekable.length) { return video.seekable.end(video.seekable.length - 1) || 0; } } catch (e) {}
      return video.duration || 0;
    }

    function playFromStartIfVod(isVod) {
      if (isVod) {
        try { video.currentTime = seekStart(); } catch (e) {}
      }
      video.play();
    }

    return {
      load: function (rawUrl) {
        var masterUrl = viaProxy(rawUrl);
        var isVod = rawUrl.indexOf('/vod/') >= 0;

        // Clips are a progressive MP4, not HLS — play them on the <video>
        // element directly (single quality). Live + VODs are HLS (.m3u8).
        if (rawUrl.indexOf('.m3u8') < 0) {
          try { if (hls) { hls.destroy(); hls = null; } } catch (e) {}
          qualities = ['Source']; levelMap = [-1]; publishQualities();
          video.src = masterUrl;
          try { video.currentTime = 0; } catch (e2) {}
          video.play();
          return;
        }

        if (Hls && Hls.isSupported()) {
          hls = new Hls({ lowLatencyMode: !isVod, startPosition: isVod ? 0 : -1 });
          hls.on(Hls.Events.MANIFEST_PARSED, function () {
            // Twitch lists source first; present highest-first after "Auto".
            var levels = hls.levels.slice();
            var order = [];
            for (var i = 0; i < levels.length; i++) { order.push(i); }
            order.sort(function (a, b) { return (levels[b].height || 0) - (levels[a].height || 0); });
            qualities = ['Auto']; levelMap = [-1];
            for (var k = 0; k < order.length; k++) {
              qualities.push(labelFor(levels[order[k]], order[k]));
              levelMap.push(order[k]);
            }
            publishQualities();
            playFromStartIfVod(isVod);
          });
          hls.on(Hls.Events.ERROR, function (e, data) {
            if (data && data.fatal) { cb.onError(TW.i18n.t('ERROR_RENDER')); }
          });
          hls.loadSource(masterUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // masterUrl is proxy-wrapped; Safari follows the rewritten playlists.
          video.onloadedmetadata = function () { playFromStartIfVod(isVod); };
          video.src = masterUrl;
          publishQualities();
        } else {
          cb.onError('HLS not supported in this browser');
        }
      },
      stop: function () { try { if (hls) { hls.destroy(); hls = null; } video.removeAttribute('src'); video.load(); } catch (e) {} },
      destroy: function () { this.stop(); },
      setDisplayArea: setVideoRect,
      getQualities: function (fn) { qcb = fn; fn(qualities); },
      selectQuality: function (i) { if (hls) { hls.currentLevel = levelMap[i] != null ? levelMap[i] : -1; } },
      canSeek: function () { return true; },
      getPosition: function () { return Math.max(0, (video.currentTime || 0) - seekStart()); },
      getDuration: function () {
        var d = seekEnd() - seekStart();
        return d > 0 && d < 1000000000 ? d : 0;
      },
      seekTo: function (seconds) {
        var d = this.getDuration();
        var t = Math.max(0, seconds || 0);
        if (d > 0 && t > d) { t = d; }
        try { video.currentTime = seekStart() + t; } catch (e) {}
      }
    };
  }

  TW.platform.createPlayer = createPlayer;
})(this);
