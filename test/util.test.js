'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./_load');

const g = loadCore(['core/polyfill.js', 'core/util.js']);
const TW = g.TW;

test('addCommas groups thousands', () => {
  assert.equal(TW.addCommas(0), '0');
  assert.equal(TW.addCommas(1234), '1,234');
  assert.equal(TW.addCommas(1234567), '1,234,567');
});

test('shortNumber compacts large counts', () => {
  assert.equal(TW.shortNumber(0), '0');
  assert.equal(TW.shortNumber(999), '999');
  assert.equal(TW.shortNumber(1000), '1k');
  assert.equal(TW.shortNumber(1234), '1.2k');
  assert.equal(TW.shortNumber(12345), '12.3k');
  assert.equal(TW.shortNumber(123456), '123k');
  assert.equal(TW.shortNumber(999999), '999k');   // truncates, never rolls to 1000k
  assert.equal(TW.shortNumber(1200000), '1.2M');
  assert.equal(TW.shortNumber(2500000000), '2.5B');
});

test('clamp bounds a number', () => {
  assert.equal(TW.clamp(5, 0, 10), 5);
  assert.equal(TW.clamp(-3, 0, 10), 0);
  assert.equal(TW.clamp(99, 0, 10), 10);
});

test('extend merges own keys', () => {
  const out = TW.extend({ a: 1 }, { b: 2, a: 3 });
  assert.deepEqual(out, { a: 3, b: 2 });
});
