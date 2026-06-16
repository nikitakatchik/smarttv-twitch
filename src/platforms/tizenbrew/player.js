/*!
 * platforms/tizenbrew/player.js — HLS playback for the TizenBrew module.
 *
 * TizenBrew loads this page as a plain document in its webview and does NOT
 * expose webapis.avplay to it, so — unlike the standalone Tizen build — we play
 * through HTML5 <video> + hls.js (Media Source Extensions), the same path the
 * web harness uses. The difference from the harness: a real TV origin needs no
 * CORS proxy. Twitch's usher/segment CDNs send permissive Access-Control-Allow-
 * Origin, so the master URL and the whole variant/segment chain load directly.
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
        var isVod = rawUrl.indexOf('/vod/') >= 0;

        // Clips are a progressive MP4, not HLS — play them on the <video>
        // element directly (single quality). Live + VODs are HLS (.m3u8).
        if (rawUrl.indexOf('.m3u8') < 0) {
          try { if (hls) { hls.destroy(); hls = null; } } catch (e) {}
          qualities = ['Source']; levelMap = [-1]; publishQualities();
          video.src = rawUrl;
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
          hls.loadSource(rawUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.onloadedmetadata = function () { playFromStartIfVod(isVod); };
          video.src = rawUrl;
          publishQualities();
        } else {
          cb.onError('HLS not supported on this TV');
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
