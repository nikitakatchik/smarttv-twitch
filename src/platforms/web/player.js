/*!
 * platforms/web/player.js — desktop harness player (hls.js + native Safari HLS).
 *
 * This is the "TV" you can run on a laptop. It implements the same player
 * contract the TV adapters do, so the channel scene can't tell the difference.
 * Browsers enforce a CORS policy that native TV players don't, and Twitch's
 * usher/playlist hosts don't send Access-Control-Allow-Origin for arbitrary
 * origins — so the harness plays through the relay (the dev server, by
 * default), whose playlist rewriting routes the whole chain back through
 * itself. The master URL arrives already relay-wrapped (see TW.twitch.usher),
 * so hls.js/Safari just follow it; no custom loader required.
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
      load: function (masterUrl) {
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
          // masterUrl is already relay-wrapped (TW.twitch.usher); Safari follows
          // the rewritten playlists itself.
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
