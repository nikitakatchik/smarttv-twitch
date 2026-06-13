/*
 * tools/lib/zip.js — a small dependency-free ZIP writer.
 *
 * Old Samsung "develop"-account App Sync and USB installs expect a .zip, and a
 * stored (uncompressed) zip is a perfectly valid zip — so the default keeps the
 * widget package STORE for maximum compatibility with the ancient Maple unzip.
 * Pass { deflate: true } for the desktop host package (which bundles a ~90 MB
 * Node runtime); DEFLATE comes from Node's built-in zlib, so still zero npm
 * dependencies. Not a general-purpose zip lib — just enough for our trees.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) { c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) { crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF]; }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name: 'core/util.js', data: Buffer, mode? }] -> a zip Buffer.
// opts.deflate compresses entries (method 8) via zlib. Optional per-file `mode`
// is a Unix st_mode (e.g. 0o100755) recorded in the external attributes so
// executables stay runnable straight out of the archive.
function zip(files, opts) {
  const deflate = !!(opts && opts.deflate);
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name.replace(/\\/g, '/'), 'utf8');
    const data = f.data;
    const crc = crc32(data);
    const hasMode = typeof f.mode === 'number';

    // Raw DEFLATE stream (no zlib header) is exactly zip method 8. Fall back to
    // STORE if compression doesn't actually shrink the entry.
    let method = 0;
    let body = data;
    if (deflate && data.length) {
      const z = zlib.deflateRawSync(data, { level: 9 });
      if (z.length < data.length) { method = 8; body = z; }
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);           // time
    local.writeUInt16LE(0x21, 12);        // date = 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    // "version made by": host 3 (Unix) when a mode is given, so it's honored.
    cd.writeUInt16LE(hasMode ? (3 << 8) | 20 : 20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    // external file attributes: Unix mode in the high 16 bits.
    cd.writeUInt32LE(hasMode ? (f.mode & 0xffff) * 0x10000 : 0, 38);
    cd.writeUInt32LE(offset, 42);         // local header offset
    central.push(cd, name);

    offset += local.length + name.length + body.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

// Walk a directory into the {name, data} list zip() expects.
function collect(dir, prefix) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.DS_Store') { continue; }
    const abs = path.join(dir, e.name);
    const rel = (prefix ? prefix + '/' : '') + e.name;
    if (e.isDirectory()) { out.push.apply(out, collect(abs, rel)); }
    else { out.push({ name: rel, data: fs.readFileSync(abs) }); }
  }
  return out;
}

// Zip an entire directory tree; entries are relative to dir (optionally under root/).
function zipDir(dir, root) {
  return zip(collect(dir, root || ''));
}

module.exports = { zip, zipDir, collect, crc32 };
