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

    function publishQualities() {
      if (qcb) { qcb(qualities); }
    }

    TW.dom.on(video, 'waiting', function () { cb.onBufferingStart(); });
    TW.dom.on(video, 'playing', function () { cb.onBufferingComplete(); cb.onPlaying(); });
    TW.dom.on(video, 'ended', function () { cb.onEnded(); });

    return {
      load: function (rawUrl) {
        // Clips are a progressive MP4, not HLS — play them on the <video>
        // element directly (single quality). Live + VODs are HLS (.m3u8).
        if (rawUrl.indexOf('.m3u8') < 0) {
          try { if (hls) { hls.destroy(); hls = null; } } catch (e) {}
          qualities = ['Source']; levelMap = [-1]; publishQualities();
          video.src = rawUrl;
          video.play();
          return;
        }

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
          hls.loadSource(rawUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = rawUrl;
          video.play();
          publishQualities();
        } else {
          cb.onError('HLS not supported on this TV');
        }
      },
      stop: function () { try { if (hls) { hls.destroy(); hls = null; } video.removeAttribute('src'); video.load(); } catch (e) {} },
      destroy: function () { this.stop(); },
      setDisplayArea: function () {},   // the <video> is CSS-fullscreen
      getQualities: function (fn) { qcb = fn; fn(qualities); },
      selectQuality: function (i) { if (hls) { hls.currentLevel = levelMap[i] != null ? levelMap[i] : -1; } }
    };
  }

  TW.platform.createPlayer = createPlayer;
})(this);
