/*!
 * core/qrcode.js — minimal QR Code generator (byte mode), ES5, zero deps.
 *
 * Encodes a short string (a Twitch device-activation URL) into a QR matrix the
 * login scene renders as a grid. Implements the QR spec directly: byte mode,
 * error-correction level M, versions 1-10 (ample for any device-code URL),
 * Reed-Solomon ECC over GF(256), the eight data masks with penalty scoring, and
 * BCH format/version info. No external library, no canvas.
 *
 * API: TW.qrcode(text) -> { count: N, isDark: function(row, col) }, or null when
 * the text is too long for version 10. A second arg forces a mask (0-7) — used
 * only by test/qrcode.test.js, which validates the output module-for-module
 * against the segno reference encoder across all 8 masks.
 */
(function (global) {
  'use strict';
  var TW = global.TW;

  // --- GF(256) arithmetic, primitive poly 0x11d (x^8+x^4+x^3+x^2+1) -------
  var EXP = [], LOG = [];
  (function () {
    var x = 1, i;
    for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) { x ^= 0x11d; } }
    for (i = 255; i < 512; i++) { EXP[i] = EXP[i - 255]; }
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  // Reed-Solomon generator polynomial of the given degree (big-endian, monic).
  function genPoly(n) {
    var g = [1], i, k;
    for (i = 0; i < n; i++) {
      var L = g.length, ng = [];
      for (k = 0; k < L + 1; k++) { ng[k] = 0; }
      for (k = 0; k < L; k++) { ng[k] ^= g[k]; }
      for (k = 0; k < L; k++) { ng[k + 1] ^= gmul(g[k], EXP[i]); }
      g = ng;
    }
    return g;
  }

  // ECC codewords for one data block (synthetic division by the generator).
  function ecBytes(data, ecLen) {
    var gen = genPoly(ecLen), res = data.slice(), i, j;
    for (i = 0; i < ecLen; i++) { res.push(0); }
    for (i = 0; i < data.length; i++) {
      var coef = res[i];
      if (coef !== 0) { for (j = 0; j < gen.length; j++) { res[i + j] ^= gmul(gen[j], coef); } }
    }
    return res.slice(data.length);
  }

  // --- per-version data, error-correction level M ------------------------
  // [ ecCodewordsPerBlock, [ [numBlocks, dataCodewordsPerBlock], ... ] ]
  var RS_M = {
    1: [10, [[1, 16]]],
    2: [16, [[1, 28]]],
    3: [26, [[1, 44]]],
    4: [18, [[2, 32]]],
    5: [24, [[2, 43]]],
    6: [16, [[4, 27]]],
    7: [18, [[4, 31]]],
    8: [22, [[2, 38], [2, 39]]],
    9: [22, [[3, 36], [2, 37]]],
    10: [26, [[4, 43], [1, 44]]]
  };

  // Alignment-pattern centre coordinates per version (empty for v1).
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  function dataCapacity(version) {
    var spec = RS_M[version], groups = spec[1], total = 0, i;
    for (i = 0; i < groups.length; i++) { total += groups[i][0] * groups[i][1]; }
    return total; // data codewords
  }

  function smallestVersion(byteLen) {
    for (var v = 1; v <= 10; v++) {
      var countBits = v < 10 ? 8 : 16;
      var needBits = 4 + countBits + 8 * byteLen;
      if (dataCapacity(v) * 8 >= needBits) { return v; }
    }
    return 0;
  }

  // --- bit buffer ---------------------------------------------------------
  function BitBuf() { this.bits = []; }
  BitBuf.prototype.put = function (value, length) {
    for (var i = length - 1; i >= 0; i--) { this.bits.push((value >>> i) & 1); }
  };

  function encodeData(text, version) {
    var bytes = [], i, c;
    // UTF-8 encode (device-code URLs are ASCII, but be correct anyway).
    for (i = 0; i < text.length; i++) {
      c = text.charCodeAt(i);
      if (c < 0x80) { bytes.push(c); }
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    }
    var cap = dataCapacity(version);
    var buf = new BitBuf();
    buf.put(4, 4);                              // byte mode
    buf.put(bytes.length, version < 10 ? 8 : 16); // char count
    for (i = 0; i < bytes.length; i++) { buf.put(bytes[i], 8); }
    // terminator (up to 4 zero bits)
    var maxBits = cap * 8;
    var term = Math.min(4, maxBits - buf.bits.length);
    for (i = 0; i < term; i++) { buf.bits.push(0); }
    // pad to byte boundary
    while (buf.bits.length % 8 !== 0) { buf.bits.push(0); }
    // pad codewords
    var pad = [0xec, 0x11], p = 0;
    var codewords = [];
    for (i = 0; i < buf.bits.length; i += 8) {
      var b = 0; for (var k = 0; k < 8; k++) { b = (b << 1) | buf.bits[i + k]; }
      codewords.push(b);
    }
    while (codewords.length < cap) { codewords.push(pad[p % 2]); p++; }
    return codewords;
  }

  // Split into RS blocks, compute ECC, interleave data then ECC codewords.
  function buildCodewords(dataCodewords, version) {
    var spec = RS_M[version], ecLen = spec[0], groups = spec[1];
    var blocks = [], di = 0, g, b;
    for (g = 0; g < groups.length; g++) {
      for (b = 0; b < groups[g][0]; b++) {
        var n = groups[g][1];
        var data = dataCodewords.slice(di, di + n); di += n;
        blocks.push({ data: data, ec: ecBytes(data, ecLen) });
      }
    }
    var out = [], i, j;
    var maxData = 0;
    for (i = 0; i < blocks.length; i++) { if (blocks[i].data.length > maxData) { maxData = blocks[i].data.length; } }
    for (j = 0; j < maxData; j++) {
      for (i = 0; i < blocks.length; i++) { if (j < blocks[i].data.length) { out.push(blocks[i].data[j]); } }
    }
    for (j = 0; j < ecLen; j++) {
      for (i = 0; i < blocks.length; i++) { out.push(blocks[i].ec[j]); }
    }
    return out;
  }

  // --- matrix construction ------------------------------------------------
  function newGrid(size) {
    var m = [], r, c;
    for (r = 0; r < size; r++) { m[r] = []; for (c = 0; c < size; c++) { m[r][c] = null; } }
    return m;
  }

  function placeFinder(m, res, r, c) {
    for (var dr = -1; dr <= 7; dr++) {
      for (var dc = -1; dc <= 7; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= m.length || cc < 0 || cc >= m.length) { continue; }
        var on = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                 (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                 (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        m[rr][cc] = on ? 1 : 0; res[rr][cc] = true;
      }
    }
  }

  function placeAlignment(m, res, version) {
    var pos = ALIGN[version], last = pos.length - 1, i, j;
    for (i = 0; i < pos.length; i++) {
      for (j = 0; j < pos.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) { continue; }
        var cr = pos[i], cc = pos[j];
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            var on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            m[cr + dr][cc + dc] = on ? 1 : 0; res[cr + dr][cc + dc] = true;
          }
        }
      }
    }
  }

  function bchFormat(data5) {
    var d = data5 << 10, g = 0x537;
    while (bitLen(d) - bitLen(g) >= 0) { d ^= g << (bitLen(d) - bitLen(g)); }
    return ((data5 << 10) | d) ^ 0x5412;
  }
  function bchVersion(ver) {
    var d = ver << 12, g = 0x1f25;
    while (bitLen(d) - bitLen(g) >= 0) { d ^= g << (bitLen(d) - bitLen(g)); }
    return (ver << 12) | d;
  }
  function bitLen(n) { var l = 0; while (n !== 0) { l++; n >>>= 1; } return l; }

  function reserveFormat(res, size) {
    var i;
    for (i = 0; i <= 8; i++) { if (i !== 6) { res[8][i] = true; res[i][8] = true; } }
    for (i = 0; i < 8; i++) { res[8][size - 1 - i] = true; res[size - 1 - i][8] = true; }
    res[size - 8][8] = true; // dark module area
  }

  function placeFormat(m, size, data5) {
    var bits = bchFormat(data5), i, b;
    for (i = 0; i < 15; i++) {
      b = (bits >> i) & 1;
      // vertical strip down column 8 (skips the timing row 6)
      if (i < 6) { m[i][8] = b; }
      else if (i < 8) { m[i + 1][8] = b; }
      else { m[size - 15 + i][8] = b; }
      // horizontal strip along row 8 (skips the timing column 6)
      if (i < 8) { m[8][size - 1 - i] = b; }
      else if (i === 8) { m[8][7] = b; }
      else { m[8][14 - i] = b; }
    }
    m[size - 8][8] = 1; // always-dark module
  }

  function placeVersion(m, size, version) {
    if (version < 7) { return; }
    var bits = bchVersion(version), i, b;
    for (i = 0; i < 18; i++) {
      b = (bits >> i) & 1;
      var r = Math.floor(i / 3), c = i % 3;
      m[r][size - 11 + c] = b;
      m[size - 11 + c][r] = b;
    }
  }

  function maskFn(mask, i, j) {
    switch (mask) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      default: return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0;
    }
  }

  function placeData(m, res, codewords) {
    var size = m.length, bitIdx = 0, total = codewords.length * 8;
    function bitAt(k) { return k < total ? (codewords[k >> 3] >> (7 - (k & 7))) & 1 : 0; }
    var col, up = true, r, c;
    for (col = size - 1; col > 0; col -= 2) {
      if (col === 6) { col = 5; }
      for (var n = 0; n < size; n++) {
        r = up ? size - 1 - n : n;
        for (c = col; c > col - 2; c--) {
          if (res[r][c]) { continue; }
          m[r][c] = bitAt(bitIdx); bitIdx++;
        }
      }
      up = !up;
    }
  }

  function penalty(m) {
    var size = m.length, score = 0, r, c, i;
    // rule 1: runs of 5+ same-colour in row/col
    for (r = 0; r < size; r++) {
      var runC = 1, runR = 1;
      for (c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { runC++; if (runC === 5) { score += 3; } else if (runC > 5) { score++; } } else { runC = 1; }
        if (m[c][r] === m[c - 1][r]) { runR++; if (runR === 5) { score += 3; } else if (runR > 5) { score++; } } else { runR = 1; }
      }
    }
    // rule 2: 2x2 blocks
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) { score += 3; }
      }
    }
    // rule 3: finder-like 1011101 patterns (with 4 light) in rows and cols
    var pat = [1, 0, 1, 1, 1, 0, 1];
    for (r = 0; r < size; r++) {
      for (c = 0; c < size - 6; c++) {
        if (matchPat(m, r, c, pat, true)) {
          if ((c >= 4 && allLight(m, r, c - 4, 4, true)) || (c + 7 + 4 <= size && allLight(m, r, c + 7, 4, true))) { score += 40; }
        }
        if (matchPat(m, c, r, pat, false)) {
          if ((c >= 4 && allLight(m, c - 4, r, 4, false)) || (c + 7 + 4 <= size && allLight(m, c + 7, r, 4, false))) { score += 40; }
        }
      }
    }
    // rule 4: dark-module proportion
    var dark = 0;
    for (r = 0; r < size; r++) { for (c = 0; c < size; c++) { if (m[r][c]) { dark++; } } }
    var ratio = dark * 100 / (size * size);
    score += Math.floor(Math.abs(ratio - 50) / 5) * 10;
    return score;
  }
  function matchPat(m, r, c, pat, horiz) {
    for (var k = 0; k < 7; k++) { var v = horiz ? m[r][c + k] : m[r + k][c]; if (v !== pat[k]) { return false; } }
    return true;
  }
  function allLight(m, r, c, len, horiz) {
    for (var k = 0; k < len; k++) { if ((horiz ? m[r][c + k] : m[r + k][c]) !== 0) { return false; } }
    return true;
  }

  function build(text, forceMask) {
    var version = smallestVersion(utf8Len(text));
    if (!version) { return null; }
    var size = version * 4 + 17;
    var dataCw = encodeData(text, version);
    var codewords = buildCodewords(dataCw, version);

    // base grid: function patterns only
    var base = newGrid(size), res = newGrid(size), r, c;
    for (r = 0; r < size; r++) { for (c = 0; c < size; c++) { res[r][c] = false; } }
    placeFinder(base, res, 0, 0);
    placeFinder(base, res, 0, size - 7);
    placeFinder(base, res, size - 7, 0);
    placeAlignment(base, res, version);
    for (c = 8; c < size - 8; c++) { base[6][c] = (c % 2 === 0) ? 1 : 0; res[6][c] = true; base[c][6] = (c % 2 === 0) ? 1 : 0; res[c][6] = true; }
    reserveFormat(res, size);
    if (version >= 7) {
      for (var i = 0; i < 18; i++) { var rr = Math.floor(i / 3), cc = i % 3; res[rr][size - 11 + cc] = true; res[size - 11 + cc][rr] = true; }
    }
    placeData(base, res, codewords);

    function render(mask) {
      var m = newGrid(size), rr, cc;
      for (rr = 0; rr < size; rr++) {
        for (cc = 0; cc < size; cc++) {
          var v = base[rr][cc];
          if (!res[rr][cc] && maskFn(mask, rr, cc)) { v = v ^ 1; }
          m[rr][cc] = v;
        }
      }
      // Format data5 = (ecLevelBits << 3) | mask; level M's indicator is 0b00,
      // so data5 is just the mask number.
      placeFormat(m, size, mask);
      placeVersion(m, size, version);
      return m;
    }

    var grid;
    if (forceMask != null) { grid = render(forceMask); }
    else {
      var best = -1, bestScore = Infinity, mk;
      for (mk = 0; mk < 8; mk++) { var g = render(mk); var s = penalty(g); if (s < bestScore) { bestScore = s; best = mk; grid = g; } }
    }
    return { count: size, isDark: function (row, col) { return grid[row][col] === 1; } };
  }

  function utf8Len(text) {
    var n = 0, i, c;
    for (i = 0; i < text.length; i++) { c = text.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3; }
    return n;
  }

  TW.qrcode = build;
})(this);
