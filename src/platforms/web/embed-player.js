/*!
 * platforms/web/embed-player.js — Twitch embed fallback for static web hosts.
 *
 * The local harness has a Node CORS proxy for hls.js. Static hosts such as
 * GitHub Pages do not, so live/VOD playback uses Twitch's official embed.
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.platform = TW.platform || {};

  function twitchVideoId(id) {
    id = String(id || '');
    return id.charAt(0) === 'v' ? id : ('v' + id);
  }

  function mediaFromUrl(rawUrl, meta) {
    var m;
    meta = meta || {};
    if (meta.kind === 'live' && meta.login) {
      return { kind: 'live', channel: meta.login };
    }
    if (meta.kind === 'vod' && meta.id) {
      return { kind: 'vod', video: twitchVideoId(meta.id) };
    }
    rawUrl = String(rawUrl || '');
    m = rawUrl.match(/\/api\/channel\/hls\/([^\/?]+)\.m3u8/);
    if (m) { return { kind: 'live', channel: decodeURIComponent(m[1]) }; }
    m = rawUrl.match(/\/vod\/([^\/?]+)\.m3u8/);
    if (m) { return { kind: 'vod', video: twitchVideoId(decodeURIComponent(m[1])) }; }
    return null;
  }

  function createEmbedFallback(opts) {
    var video = opts.video;
    var embed = opts.embed;
    var cb = opts.callbacks;
    var player = null;
    var kind = null;

    function available() {
      return !!(TW.platform.useEmbedPlayer && embed &&
        global.Twitch && global.Twitch.Player);
    }

    function showVideo() {
      if (embed) { embed.style.display = 'none'; }
      if (video) { video.style.display = 'block'; }
    }

    function showEmbed() {
      if (video) { video.style.display = 'none'; }
      if (embed) { embed.style.display = 'block'; }
    }

    function on(eventName, fn) {
      var Player = global.Twitch && global.Twitch.Player;
      var eventValue = Player && Player[eventName];
      if (player && player.addEventListener && eventValue) {
        player.addEventListener(eventValue, fn);
      }
    }

    return {
      load: function (rawUrl, meta) {
        var Player = global.Twitch && global.Twitch.Player;
        var media, playerOpts, host;
        if (!available()) { return false; }
        media = mediaFromUrl(rawUrl, meta);
        if (!media) { return false; }

        this.stop();
        showEmbed();

        host = global.location && global.location.hostname;
        playerOpts = { width: '100%', height: '100%', autoplay: true, muted: false };
        if (host) { playerOpts.parent = [host]; }
        if (media.kind === 'live') { playerOpts.channel = media.channel; }
        else { playerOpts.video = media.video; }

        try {
          player = new Player('tw-embed', playerOpts);
          kind = media.kind;
        } catch (e) {
          this.stop();
          showVideo();
          return false;
        }

        opts.setQualities(['Auto']);
        on('PLAY', function () { cb.onBufferingStart(); });
        on('PLAYING', function () { cb.onBufferingComplete(); cb.onPlaying(); });
        on('ENDED', function () { cb.onEnded(); });
        on('OFFLINE', function () { cb.onError(TW.i18n.t('ERROR_RENDER')); });
        on('PLAYBACK_BLOCKED', function () { cb.onError(TW.i18n.t('ERROR_RENDER')); });
        return true;
      },

      stop: function () {
        try { if (player && player.pause) { player.pause(); } } catch (e) {}
        player = null;
        kind = null;
        if (embed) {
          embed.innerHTML = '';
          embed.style.display = 'none';
        }
      },

      active: function () { return !!kind; },
      canSeek: function () { return kind === 'vod'; },

      setDisplayArea: function (left, top, width, height) {
        if (!embed) { return; }
        embed.style.position = 'absolute';
        embed.style.left = left;
        embed.style.top = top;
        embed.style.width = width;
        embed.style.height = height;
      },

      getPosition: function () {
        if (player && kind === 'vod' && player.getCurrentTime) {
          try { return player.getCurrentTime() || 0; } catch (e) { return 0; }
        }
        return 0;
      },

      getDuration: function () {
        if (player && kind === 'vod' && player.getDuration) {
          try { return player.getDuration() || 0; } catch (e) { return 0; }
        }
        return 0;
      },

      seekTo: function (seconds) {
        if (player && kind === 'vod' && player.seek) {
          try { player.seek(seconds); } catch (e) {}
        }
      },

      pause: function () { try { if (player && player.pause) { player.pause(); } } catch (e) {} },
      resume: function () { try { if (player && player.play) { player.play(); } } catch (e) {} }
    };
  }

  TW.platform.createEmbedFallback = createEmbedFallback;
})(this);
