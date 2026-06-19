'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadCore } = require('./_load');

const SRC = path.resolve(__dirname, '..', 'src');
const LANG_FILES = fs.readdirSync(path.join(SRC, 'lang'))
  .filter((f) => f.endsWith('.js'))
  .sort();
const CORE_FILES = [
  'core/polyfill.js', 'core/util.js', 'core/i18n.js',
];
const g = loadCore([
  ...CORE_FILES,
  ...LANG_FILES.map((f) => 'lang/' + f),
]);
const i18n = g.TW.i18n;

function langCode(file) {
  return file.replace(/\.js$/, '');
}

function readCatalog(file) {
  const result = {};
  const sandbox = {
    TW: {
      i18n: {
        register(code, dict) {
          result.code = code;
          result.dict = dict;
        },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'lang', file), 'utf8'), sandbox, { filename: file });
  assert.ok(result.dict, file + ' should register a catalog');
  return result;
}

function placeholders(s) {
  return (s.match(/\{\d+\}/g) || []).sort();
}

test('translates in the active language', () => {
  i18n.setLanguage('de');
  assert.equal(i18n.t('CHANNELS'), 'Kanäle');
  assert.equal(i18n.t('VIEWERS'), 'Zuschauer');
});

test('falls back to English then to the key', () => {
  const partial = loadCore(CORE_FILES.concat(['lang/en.js']));
  partial.TW.i18n.register('partial', {});
  partial.TW.i18n.setLanguage('partial');
  assert.equal(partial.TW.i18n.t('CHANNELS'), 'Channels');
  assert.equal(partial.TW.i18n.t('NOPE_NOT_A_KEY'), 'NOPE_NOT_A_KEY');
});

test('an unknown language falls back to en', () => {
  assert.equal(i18n.setLanguage('zz'), 'en');
  assert.equal(i18n.t('CHANNELS'), 'Channels');
});

test('lists registered languages', () => {
  const avail = Array.from(i18n.available());
  assert.deepEqual(avail.sort(), LANG_FILES.map(langCode).sort());
});

test('all locale files mirror English keys and placeholders', () => {
  const en = readCatalog('en.js').dict;
  const keys = Object.keys(en).sort();
  for (const file of LANG_FILES) {
    const catalog = readCatalog(file);
    assert.equal(catalog.code, langCode(file), file + ' register code');
    assert.deepEqual(Object.keys(catalog.dict).sort(), keys, file + ' keys');
    for (const key of keys) {
      assert.equal(typeof catalog.dict[key], 'string', file + ' ' + key + ' string');
      assert.notEqual(catalog.dict[key], '', file + ' ' + key + ' non-empty');
      assert.deepEqual(placeholders(catalog.dict[key]), placeholders(en[key]), file + ' ' + key + ' placeholders');
    }
  }
});

test('platform entrypoints load every locale file', () => {
  const platforms = [
    'platforms/orsay/index.html',
    'platforms/tizen/index.html',
    'platforms/tizenbrew/index.html',
    'platforms/web/index.html',
  ];
  for (const platform of platforms) {
    const html = fs.readFileSync(path.join(SRC, platform), 'utf8');
    for (const file of LANG_FILES) {
      assert.ok(html.indexOf('src="lang/' + file + '"') >= 0, platform + ' loads ' + file);
    }
  }
});
