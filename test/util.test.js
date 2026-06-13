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

test('clamp bounds a number', () => {
  assert.equal(TW.clamp(5, 0, 10), 5);
  assert.equal(TW.clamp(-3, 0, 10), 0);
  assert.equal(TW.clamp(99, 0, 10), 10);
});

test('extend merges own keys', () => {
  const out = TW.extend({ a: 1 }, { b: 2, a: 3 });
  assert.deepEqual(out, { a: 3, b: 2 });
});
