'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');

const zlib = require('node:zlib');
const { bundle } = require('../tools/lib/bundle');
const { zip, collect } = require('../tools/lib/zip');
const { startHost } = require('../tools/lib/serve-host');
const { build } = require('../tools/build');

const HOST_ENTRY = path.resolve(__dirname, '..', 'tools', 'host-bundle.js');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('bundle inlines every local require into one self-contained script', () => {
  const out = bundle(HOST_ENTRY);
  // No relative require survives — they all become __require(n).
  assert.ok(!/require\(\s*['"]\.\.?\//.test(out), 'a local require leaked through');
  assert.match(out, /__require\(/);
  // The local dependency graph is genuinely inlined...
  assert.match(out, /function crc32/, 'zip.js not inlined');
  assert.match(out, /startHost/, 'serve-host.js not inlined');
  // ...while built-in requires are left for Node to resolve at run time.
  assert.match(out, /require\('http'\)/);
});

test('zip records a Unix executable bit in the external attributes', () => {
  const buf = zip([{ name: 'run', data: Buffer.from('x'), mode: 0o100755 }]);
  const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); // central dir header
  assert.ok(cd > 0, 'central directory record present');
  assert.equal(buf.readUInt16LE(cd + 4) >> 8, 3, 'version-made-by host = Unix');
  assert.equal(buf.readUInt32LE(cd + 38) >>> 16, 0o100755, 'mode preserved');
});

test('zip deflate compresses and round-trips', () => {
  const data = Buffer.from('twellie '.repeat(2000), 'utf8');
  const buf = zip([{ name: 'a.txt', data }], { deflate: true });
  assert.ok(buf.length < data.length, 'compressed smaller than raw');
  // Local header: method 8, compressed < uncompressed.
  assert.equal(buf.readUInt16LE(8), 8, 'method = deflate');
  const comp = buf.readUInt32LE(18);
  const uncomp = buf.readUInt32LE(22);
  assert.equal(uncomp, data.length);
  assert.ok(comp < uncomp);
  // The stored bytes inflate back to the original.
  const nameLen = buf.readUInt16LE(26);
  const body = buf.subarray(30 + nameLen, 30 + nameLen + comp);
  assert.deepEqual(zlib.inflateRawSync(body), data);
});

test('host serves the widget zip and a develop-account widgetlist', async () => {
  const out = build('orsay', path.join(__dirname, '..', 'dist', 'test-host'));
  const server = startHost(collect(out, ''), { ip: '127.0.0.1', port: 0, quiet: true });
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const list = await get(base + '/widgetlist.xml');
    assert.equal(list.status, 200);
    assert.match(list.body.toString('utf8'), /<widget id="Twellie">/);

    const z = await get(base + '/Twellie.zip');
    assert.equal(z.status, 200);
    assert.equal(z.headers['content-type'], 'application/zip');
    assert.equal(z.body.slice(0, 2).toString('utf8'), 'PK'); // a real zip
  } finally {
    server.close();
  }
});
