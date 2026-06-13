#!/usr/bin/env node
/*
 * tools/lint-es5.js — guard the TV-targeted code against ES6+ syntax.
 *
 * The shared core and the Orsay/Tizen adapters must run on engines as old as
 * 2011 MAPLE (Gecko 1.8.1). This greps those files for constructs that simply
 * break there — arrow functions, let/const, template literals, fetch,
 * Promise, classList, spread — and fails the build if any appear. The browser
 * harness, the proxy worker, the tests and these tools are exempt (they run on
 * modern engines).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN = [
  'src/core',
  'src/lang',
  'src/platforms/orsay',
  'src/platforms/tizen',
];

const RULES = [
  [/=>/, 'arrow function'],
  [/\blet\s/, 'let'],
  [/\bconst\s/, 'const'],
  [/`/, 'template literal'],
  [/\bfetch\s*\(/, 'fetch() (use XMLHttpRequest)'],
  [/\bPromise\b/, 'Promise'],
  [/\.classList\b/, 'classList'],
  [/\bclass\s+[A-Z]/, 'class declaration'],
];

// Strip // line comments and /* */ block comments to avoid false positives.
function strip(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function jsFiles(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { jsFiles(p, out); }
    else if (e.name.endsWith('.js')) { out.push(p); }
  }
  return out;
}

let violations = 0;
for (const base of SCAN) {
  const dir = path.join(ROOT, base);
  if (!fs.existsSync(dir)) { continue; }
  for (const file of jsFiles(dir, [])) {
    const lines = strip(fs.readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const [re, name] of RULES) {
        if (re.test(line)) {
          console.error(path.relative(ROOT, file) + ':' + (i + 1) + '  ES6 ' + name);
          violations++;
        }
      }
    });
  }
}

if (violations) {
  console.error('\nES5 lint failed: ' + violations + ' issue(s).');
  process.exit(1);
}
console.log('ES5 lint passed (' + SCAN.length + ' trees clean).');
