'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./_load');

function loadQr() {
  const g = loadCore(['core/polyfill.js', 'core/util.js', 'core/qrcode.js'], {});
  return g.TW.qrcode;
}

// Golden matrix for a real device-activation URL. This exact output was verified
// to decode back to the URL with an independent decoder (OpenCV QRCodeDetector)
// and module-for-module against segno's data region; freezing it guards against
// any regression in encoding, ECC, placement, masking, or format info.
const GOLDEN_URL = 'https://www.twitch.tv/activate?device-code=GSWYXLZX';
const GOLDEN = ["111111101011111110101011001111111","100000100110111000111100101000001","101110100010101101111101101011101","101110101110000111000101101011101","101110101101110011010010001011101","100000101000010101001110001000001","111111101010101010101010101111111","000000001000001001111100100000000","100010111000001111000110011111001","101000011101100111100001010001100","111001110000011100100001000001010","110110011000010110001100111000010","101000110010110010011011101011001","100111000101001000111110010101100","110101110101010101000111111011110","011000001111011111100101111000000","000111101010001001000111101010010","010100011110010110100111100001110","010001101101011111000111111101010","101011001011111001111100111100000","100010111000011000100010001011001","100111011110000010010011110000010","000001110001100010000101110010010","000111010010101001110111111010011","111111110011100111001110111110011","000000001010101111001101100010110","111111101110110100100110101011010","100000100011001110000110100010011","101110101000100110000010111111000","101110100011001000110001001110100","101110100100111101100010011110100","100000100011011111001101110000000","111111101101101001001111111000001"];

test('qrcode reproduces the verified golden matrix (decodes to the URL)', () => {
  const qrcode = loadQr();
  const qr = qrcode(GOLDEN_URL);
  assert.ok(qr, 'should encode');
  assert.equal(qr.count, 33, 'device-code URL -> version 4 (33x33)');
  for (let r = 0; r < qr.count; r++) {
    let row = '';
    for (let c = 0; c < qr.count; c++) { row += qr.isDark(r, c) ? '1' : '0'; }
    assert.equal(row, GOLDEN[r], 'row ' + r + ' matches golden');
  }
});

test('qrcode picks the smallest version that fits', () => {
  const qrcode = loadQr();
  assert.equal(qrcode('AB').count, 21, 'tiny -> v1 (21x21)');
  assert.equal(qrcode('https://www.twitch.tv/activate').count, 29, '30 bytes -> v3 (29x29)');
});

test('qrcode lays correct finder patterns in all three corners', () => {
  const qrcode = loadQr();
  const qr = qrcode(GOLDEN_URL), n = qr.count;
  // a finder is a 7x7 ring with a 3x3 solid centre
  function isFinder(r0, c0) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const on = (r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        if (qr.isDark(r0 + r, c0 + c) !== on) { return false; }
      }
    }
    return true;
  }
  assert.ok(isFinder(0, 0), 'top-left finder');
  assert.ok(isFinder(0, n - 7), 'top-right finder');
  assert.ok(isFinder(n - 7, 0), 'bottom-left finder');
});

test('qrcode is deterministic and returns null when too long for v10', () => {
  const qrcode = loadQr();
  const url = GOLDEN_URL;
  assert.deepEqual(serialize(qrcode(url)), serialize(qrcode(url)), 'same input -> same matrix');
  let huge = ''; for (let i = 0; i < 300; i++) { huge += 'x'; }
  assert.equal(qrcode(huge), null, 'beyond v10 capacity -> null');
});

function serialize(qr) {
  const rows = [];
  for (let r = 0; r < qr.count; r++) { let s = ''; for (let c = 0; c < qr.count; c++) { s += qr.isDark(r, c) ? '1' : '0'; } rows.push(s); }
  return rows;
}
