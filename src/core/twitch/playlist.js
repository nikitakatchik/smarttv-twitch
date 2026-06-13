/*!
 * core/twitch/playlist.js — parse a Twitch HLS master playlist (.m3u8).
 *
 * usher returns a master playlist whose variants look like:
 *
 *   #EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked",NAME="1080p60 (source)",...
 *   #EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60,VIDEO="chunked"
 *   https://video-weaver.<edge>.hls.ttvnw.net/v1/playlist/....m3u8
 *
 * We pair each NAME (human label) with the following STREAM-INF attributes and
 * the media-playlist URL. The original app did this with a brittle multiline
 * regex; this is a line scanner that tolerates attribute reordering and the
 * #EXT-X-TWITCH-* lines Twitch sprinkles in.
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  function parseAttributes(line) {
    // line is the part after "#EXT-X-STREAM-INF:" or "#EXT-X-MEDIA:".
    // Attributes are KEY=VALUE, comma-separated, values optionally quoted and
    // themselves possibly containing commas (CODECS="a,b") — so we can't just
    // split on commas. Walk it respecting quotes.
    var attrs = {};
    var i = 0, n = line.length;
    while (i < n) {
      var eq = line.indexOf('=', i);
      if (eq < 0) { break; }
      var key = line.substring(i, eq).replace(/^\s+|\s+$/g, '');
      var j = eq + 1, val = '';
      if (line.charAt(j) === '"') {
        var end = line.indexOf('"', j + 1);
        if (end < 0) { end = n; }
        val = line.substring(j + 1, end);
        i = end + 2; // skip closing quote + comma
      } else {
        var comma = line.indexOf(',', j);
        if (comma < 0) { comma = n; }
        val = line.substring(j, comma);
        i = comma + 1;
      }
      attrs[key] = val;
    }
    return attrs;
  }

  /**
   * Returns an array of variants:
   *   { name, url, bandwidth, resolution, frameRate, group }
   * ordered as Twitch lists them (source/highest first).
   */
  function parseMaster(text) {
    var lines = String(text).split('\n');
    var variants = [];
    var pendingName = null;
    var pendingGroup = null;
    var pendingInf = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\r$/, '');
      if (line === '') { continue; }

      if (line.indexOf('#EXT-X-MEDIA:') === 0) {
        var m = parseAttributes(line.substring('#EXT-X-MEDIA:'.length));
        pendingName = m.NAME || null;
        pendingGroup = m['GROUP-ID'] || null;
      } else if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
        pendingInf = parseAttributes(line.substring('#EXT-X-STREAM-INF:'.length));
      } else if (line.charAt(0) !== '#' && pendingInf) {
        // A URL line that follows a STREAM-INF closes the current variant.
        var inf = pendingInf;
        variants.push({
          name: pendingName || inf.VIDEO || ('q' + variants.length),
          group: pendingGroup || inf.VIDEO || null,
          url: line,
          bandwidth: inf.BANDWIDTH ? parseInt(inf.BANDWIDTH, 10) : 0,
          resolution: inf.RESOLUTION || '',
          frameRate: inf['FRAME-RATE'] ? Math.round(parseFloat(inf['FRAME-RATE'])) : 0
        });
        pendingName = null; pendingGroup = null; pendingInf = null;
      }
    }
    return variants;
  }

  TW.twitch = TW.twitch || {};
  TW.twitch.playlist = { parseMaster: parseMaster, parseAttributes: parseAttributes };
})(this);
