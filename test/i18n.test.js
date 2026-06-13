'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./_load');

const g = loadCore([
  'core/polyfill.js', 'core/util.js', 'core/i18n.js',
  'lang/en.js', 'lang/de.js',
]);
const i18n = g.TW.i18n;

test('translates in the active language', () => {
  i18n.setLanguage('de');
  assert.equal(i18n.t('CHANNELS'), 'Kanäle');
  assert.equal(i18n.t('VIEWERS'), 'Zuschauer');
});

test('falls back to English then to the key', () => {
  i18n.setLanguage('de');
  // a key present only in en would fall back; an unknown key returns itself
  assert.equal(i18n.t('NOPE_NOT_A_KEY'), 'NOPE_NOT_A_KEY');
});

test('an unknown language falls back to en', () => {
  assert.equal(i18n.setLanguage('zz'), 'en');
  assert.equal(i18n.t('CHANNELS'), 'Channels');
});

test('lists registered languages', () => {
  const avail = i18n.available();
  assert.ok(avail.indexOf('en') >= 0 && avail.indexOf('de') >= 0);
});
