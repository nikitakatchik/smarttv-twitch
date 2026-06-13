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

    function publishQualities() {
      if (qcb) { qcb(qualities); }
    }

    TW.dom.on(video, 'waiting', function () { cb.onBufferingStart(); });
    TW.dom.on(video, 'playing', function () { cb.onBufferingComplete(); cb.onPlaying(); });
    TW.dom.on(video, 'ended', function () { cb.onEnded(); });

    // Dev-only: route the HLS chain through the dev server's CORS proxy.
    function viaProxy(url) {
      var base = TW.platform.proxyBase;
      return base ? base.replace(/\/$/, '') + '/proxy?url=' + encodeURIComponent(url) : url;
    }

    return {
      load: function (rawUrl) {
        var masterUrl = viaProxy(rawUrl);
        if (Hls && Hls.isSupported()) {
          hls = new Hls({ lowLatencyMode: true });
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
            video.play();
          });
          hls.on(Hls.Events.ERROR, function (e, data) {
            if (data && data.fatal) { cb.onError(TW.i18n.t('ERROR_RENDER')); }
          });
          hls.loadSource(masterUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // masterUrl is proxy-wrapped; Safari follows the rewritten playlists.
          video.src = masterUrl;
          video.play();
          publishQualities();
        } else {
          cb.onError('HLS not supported in this browser');
        }
      },
      stop: function () { try { if (hls) { hls.destroy(); hls = null; } video.removeAttribute('src'); video.load(); } catch (e) {} },
      destroy: function () { this.stop(); },
      setDisplayArea: function () {},   // the <video> fills its container
      getQualities: function (fn) { qcb = fn; fn(qualities); },
      selectQuality: function (i) { if (hls) { hls.currentLevel = levelMap[i] != null ? levelMap[i] : -1; } }
    };
  }

  TW.platform.createPlayer = createPlayer;
})(this);
