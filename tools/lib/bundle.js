/*
 * tools/lib/bundle.js — a tiny CommonJS inliner (no bundler dependency).
 *
 * Resolves an entry file's local `require('./x')` graph into a single .js file
 * with a ~10-line module runtime. Bare/built-in requires (http, fs, https, os,
 * path, …) are left untouched for Node to resolve at run time. We use it to
 * produce the one script embedded in the native host executable (tools/bin.js),
 * so zip/serve-host stay single-sourced instead of copy-pasted.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Only relative requires (./ or ../) get inlined; bare names stay as-is.
const LOCAL_REQUIRE = /require\(\s*(['"])(\.\.?\/[^'"]+)\1\s*\)/g;

function bundle(entry) {
  const ids = new Map(); // absolute path -> numeric module id
  const mods = [];       // [{ id, src }]

  function add(file) {
    const abs = require.resolve(file);
    if (ids.has(abs)) { return ids.get(abs); }
    const id = mods.length;
    ids.set(abs, id);
    mods.push(null); // reserve the slot first so import cycles resolve
    const dir = path.dirname(abs);
    const src = fs.readFileSync(abs, 'utf8').replace(LOCAL_REQUIRE, (m, q, rel) =>
      '__require(' + add(path.resolve(dir, rel)) + ')');
    mods[id] = { id, src };
    return id;
  }

  const entryId = add(entry);

  const out = [
    '(function () {',
    '  var __cache = {};',
    '  var __mods = {};',
    '  function __require(id) {',
    '    if (__cache[id]) { return __cache[id].exports; }',
    '    var module = __cache[id] = { exports: {} };',
    '    __mods[id](module, module.exports, __require);',
    '    return module.exports;',
    '  }',
  ];
  for (const m of mods) {
    out.push('  __mods[' + m.id + '] = function (module, exports, __require) {');
    out.push(m.src);
    out.push('  };');
  }
  out.push('  __require(' + entryId + ');');
  out.push('})();');
  return out.join('\n');
}

module.exports = { bundle };
