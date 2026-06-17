/*!
 * platforms/web/player.js — desktop harness player (hls.js + native Safari HLS).
 *
 * This is the "TV" you can run on a laptop. It implements the same player
 * contract the TV adapters do, so the channel scene can't tell the difference.
 * Browsers enforce a CORS policy that native TV players don't, and Twitch's
 * usher/playlist hosts don't send Access-Control-Allow-Origin for arbitrary
 * origins — so the local harness routes the HLS master URL through the dev
 * server's CORS proxy (TW.platform.proxyBase). Static hosts such as GitHub Pages
 * use platform/embed-player.js for live/VOD playback instead.
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
    var embedFallback = null;
    var qualities = ['Auto'];
    var levelMap = [-1];        // quality index -> hls level index (-1 = auto)
    var qcb = null;
    var pendingSeek = null;
    var seekTimer = null;

    function publishQualities() {
      if (qcb) { qcb(qualities); }
    }

    if (TW.platform.createEmbedFallback) {
      embedFallback = TW.platform.createEmbedFallback({
        video: video,
        embed: TW.dom.get('tw-embed'),
        callbacks: cb,
        setQualities: function (list) {
          qualities = (list && list.length) ? list : ['Auto'];
          levelMap = [-1];
          publishQualities();
        }
      });
    }

    function setVideoRect(x, y, w, h) {
      var left, top, width, height;
      left = Math.round(x) + 'px';
      top = Math.round(y) + 'px';
      width = Math.round(w) + 'px';
      height = Math.round(h) + 'px';
      video.style.position = 'absolute';
      video.style.left = left;
      video.style.top = top;
      video.style.width = width;
      video.style.height = height;
      video.style.objectFit = 'contain';
      if (embedFallback) { embedFallback.setDisplayArea(left, top, width, height); }
    }

    TW.dom.on(video, 'waiting', function () { cb.onBufferingStart(); });
    TW.dom.on(video, 'playing', function () { cb.onBufferingComplete(); cb.onPlaying(); });
    TW.dom.on(video, 'ended', function () { cb.onEnded(); });

    // Dev-only: route the HLS chain through the dev server's CORS proxy.
    function viaProxy(url) {
      var base = TW.platform.proxyBase;
      return base ? base.replace(/\/$/, '') + '/proxy?url=' + encodeURIComponent(url) : url;
    }

    function playFromStartIfVod(isVod) {
      if (isVod) {
        try { video.currentTime = 0; } catch (e) {}
      }
      video.play();
    }

    function duration() {
      var d = (embedFallback && embedFallback.active()) ? embedFallback.getDuration() : (video.duration || 0);
      return d > 0 && d < 1000000000 ? d : 0;
    }

    function position() {
      return (embedFallback && embedFallback.active()) ? embedFallback.getPosition() : (video.currentTime || 0);
    }

    function setPosition(t) {
      if (embedFallback && embedFallback.active()) { embedFallback.seekTo(t); }
      else { try { video.currentTime = t; } catch (e) {} }
    }

    function clearPendingSeek() {
      if (seekTimer) { global.clearTimeout(seekTimer); seekTimer = null; }
      pendingSeek = null;
    }

    function commitSeek() {
      if (seekTimer) { global.clearTimeout(seekTimer); seekTimer = null; }
      var t = pendingSeek;
      pendingSeek = null;
      if (t == null) { return; }
      setPosition(t);
    }

    function scheduleSeek(t) {
      pendingSeek = t;
      if (seekTimer) { global.clearTimeout(seekTimer); }
      seekTimer = global.setTimeout(commitSeek, 280);
    }

    return {
      load: function (rawUrl, meta) {
        var masterUrl = viaProxy(rawUrl);
        var isVod = rawUrl.indexOf('/vod/') >= 0;

        if (rawUrl.indexOf('.m3u8') >= 0 && embedFallback && embedFallback.load(rawUrl, meta)) { return; }
        if (embedFallback) { embedFallback.stop(); }
        video.style.display = 'block';

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
          // masterUrl is proxy-wrapped in dev; Safari follows rewritten playlists.
          video.onloadedmetadata = function () { playFromStartIfVod(isVod); };
          video.src = masterUrl;
          publishQualities();
        } else {
          cb.onError('HLS not supported in this browser');
        }
      },
      stop: function () {
        try {
          clearPendingSeek();
          if (hls) { hls.destroy(); hls = null; }
          if (embedFallback) { embedFallback.stop(); }
          video.removeAttribute('src');
          video.load();
        } catch (e) {}
      },
      destroy: function () { this.stop(); },
      setDisplayArea: setVideoRect,
      getQualities: function (fn) { qcb = fn; fn(qualities); },
      selectQuality: function (i) { if (hls) { hls.currentLevel = levelMap[i] != null ? levelMap[i] : -1; } },
      canSeek: function () { return !(embedFallback && embedFallback.active()) || embedFallback.canSeek(); },
      getPosition: function () { return Math.max(0, pendingSeek != null ? pendingSeek : position()); },
      getDuration: duration,
      seekTo: function (seconds) {
        var d = duration();
        var t = Math.max(0, seconds || 0);
        if (d > 0 && t > d) { t = d; }
        scheduleSeek(t);
      },
      commitSeek: commitSeek,
      pause: function () {
        if (embedFallback && embedFallback.active()) { embedFallback.pause(); return; }
        try { video.pause(); } catch (e) {}
      },
      resume: function () {
        if (embedFallback && embedFallback.active()) { embedFallback.resume(); return; }
        try { video.play(); } catch (e) {}
      }
    };
  }

  TW.platform.createPlayer = createPlayer;
})(this);
