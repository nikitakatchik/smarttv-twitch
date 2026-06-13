/*
 * tools/lib/zip.js — a ~60-line dependency-free ZIP writer (STORE method).
 *
 * Old Samsung "develop"-account App Sync and USB installs expect a .zip; a
 * stored (uncompressed) zip is a perfectly valid zip and lets us package the
 * widget with zero npm dependencies. Not a general-purpose zip lib — just
 * enough to write small static trees.
 */
'use strict';

const fs = require('fs');
const path = require('path');

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

// files: [{ name: 'core/util.js', data: Buffer }] -> a zip Buffer.
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name.replace(/\\/g, '/'), 'utf8');
    const data = f.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);            // method 0 = store
    local.writeUInt16LE(0, 10);           // time
    local.writeUInt16LE(0x21, 12);        // date = 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed = uncompressed
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 10);              // method
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);         // local header offset
    central.push(cd, name);

    offset += local.length + name.length + data.length;
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
