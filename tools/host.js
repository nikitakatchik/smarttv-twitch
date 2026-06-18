#!/usr/bin/env node
/*
 * tools/host.js — run the Orsay installer straight from the source tree.
 *
 *   npm run host            (or: node tools/host.js [port])
 *
 * Developer convenience: builds the Orsay widget from src/ and serves the
 * App-Sync install endpoints. End users don't need Node or this script — they
 * download the self-contained installer (built by tools/bin.js, `npm run
 * host:package`). Both share tools/lib/serve-host.
 */
'use strict';

const path = require('path');
const { build, ROOT } = require('./build');
const { collect } = require('./lib/zip');
const { startHost, lanIP } = require('./lib/serve-host');

const portArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const PORT = parseInt(portArg || process.env.PORT || '8080', 10);

const buildDir = path.join(ROOT, 'dist', 'host', 'build');
build('orsay', buildDir);

startHost(collect(buildDir, ''), { ip: lanIP(), port: PORT });
