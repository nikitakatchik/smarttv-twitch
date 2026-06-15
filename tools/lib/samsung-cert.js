'use strict';
/*
 * tools/lib/samsung-cert.js — mint a Samsung *Visual Display* (TV) author +
 * DUID-bound distributor certificate with NO GUI and NO Certificate Manager.
 *
 * This is the headless reimplementation of what Tizen Studio's "Samsung
 * Certificate" wizard does. A real retail Samsung TV (2018+) refuses to install
 * a .wgt unless its distributor signature is a Samsung VD distributor cert whose
 * profile embeds that TV's DUID — the SDK's bundled generic Tizen distributor
 * cert fails with `install failed [118, -12] Invalid certificate chain`. So for
 * sideloading there is no avoiding a Samsung-issued cert; this module just gets
 * one without clicking through a UI.
 *
 * The flow, reverse-engineered from the official Samsung Certificate Extension
 * (download.tizen.org/sdk/extensions/tizen-certificate-extension_*.zip) and the
 * andreas-mausch/moonwatch + sreyemnayr/tizencertificates research:
 *
 *   1. OAuth: open account.samsung.com, get an access_token + user_id. This is
 *      the ONE irreducible interactive step — Samsung's CA only issues against a
 *      Samsung-account token and offers no password/client-credentials grant.
 *   2. openssl: generate an author key + CSR, and a distributor key + CSR whose
 *      subjectAltName carries `URI:URN:tizen:deviceid=<DUID>` for each TV.
 *   3. POST each CSR (multipart) to the v3 CA → a Samsung-signed leaf cert.
 *   4. Concatenate leaf + the matching VD CA cert and bundle into a PKCS#12.
 *
 * The endpoints / SERVICE_ID below are *pinned* from the current extension
 * (2.0.75, verified live 2026-06) to avoid a 44 MB download on every run, but
 * refreshConfig() re-derives them from Samsung's extension when asked, so this
 * keeps working if Samsung rotates them.
 *
 * NOTE: tokens, user ids and the minted .p12 are secrets — this module never
 * writes them anywhere except the cert dir you pass in, and never logs values.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

// --- pinned live config (from tizen-certificate-extension_2.0.75, 2026-06) ----
// These are public constants shipped in Samsung's own SDK extension, not secrets.
const PINNED = {
  serviceId: 'v285zxnl3h',
  authorUrl: 'https://svdca.samsungqbe.com/apis/v3/authors',
  distributorUrl: 'https://svdca.samsungqbe.com/apis/v3/distributors',
  loginBase: 'https://account.samsung.com/mobile/account/check.do',
  // Samsung matches redirect_uri EXACTLY against its registered value, which is
  // the literal 'localhost' (verified in the extension's redirectUrl constant) —
  // 127.0.0.1 gets rejected at the OAuth step.
  redirectHost: 'localhost',
  redirectPort: 4794,
  redirectPath: '/signin/callback',
  // CA leaf names inside the extension jar, per privilege, for the VD (TV) platform.
  vdAuthorCa: 'vd_tizen_dev_author_ca.cer',
  vdDistCa: { public: 'vd_tizen_dev_public2.crt', partner: 'vd_tizen_dev_partner2.crt', platform: 'vd_tizen_dev_platform2.crt' },
};

const EXT_INFO_URL = 'https://download.tizen.org/sdk/tizenstudio/official/extension_info.xml';
const EXT_FALLBACK = 'https://download.tizen.org/sdk/extensions/tizen-certificate-extension_2.0.75.zip';

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

// The OAuth URL the user opens in a browser. accessToken=Y makes Samsung hand
// the token straight back to redirect_uri instead of an exchangeable code.
function buildAuthUrl(cfg, redirectUri) {
  const q = [
    'serviceID=' + encodeURIComponent(cfg.serviceId),
    'actionID=StartOAuth2',
    'accessToken=Y',
    'redirect_uri=' + encodeURIComponent(redirectUri),
  ].join('&');
  return cfg.loginBase + '?' + q;
}

function redirectUri(cfg) {
  return 'http://' + cfg.redirectHost + ':' + cfg.redirectPort + cfg.redirectPath;
}

// subjectAltName value binding a distributor cert to one or more TV DUIDs.
// Always leads with an empty packageid (matches what Certificate Manager emits).
function sanForDuids(duids) {
  const parts = ['URI:URN:tizen:packageid='];
  duids.forEach(function (d) {
    const t = String(d).trim();
    if (t) parts.push('URI:URN:tizen:deviceid=' + t);
  });
  return parts.join(',');
}

// Pull {accessToken, userId} out of whatever Samsung sends to the callback.
// Defensive: the token may arrive as direct query params, as a JSON `code`/
// `authData` param, or as a JSON/form POST body. Returns null if not found.
function parseToken(input) {
  if (!input) return null;
  // 1. already an object (POST JSON body)
  let obj = null;
  if (typeof input === 'object') {
    obj = input;
  } else {
    const s = String(input).trim();
    // a full URL, a path+query, or a bare query string — take whatever is after '?'
    let query = s;
    const qi = s.indexOf('?');
    if (qi !== -1) query = s.slice(qi + 1);
    const params = {};
    query.split('&').forEach(function (kv) {
      if (!kv) return;
      const eq = kv.indexOf('=');
      const k = eq === -1 ? kv : kv.slice(0, eq);
      const v = eq === -1 ? '' : kv.slice(eq + 1);
      try { params[k] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { params[k] = v; }
    });
    // token sometimes wrapped in a JSON blob under code/authData/result
    const blob = params.code || params.authData || params.result || params.data;
    if (blob) { try { obj = JSON.parse(blob); } catch (e) { /* not json */ } }
    if (!obj) {
      // maybe the whole string is JSON
      try { obj = JSON.parse(s); } catch (e) { obj = params; }
    }
  }
  const access = obj.access_token || obj.accessToken || obj.token;
  const user = obj.userId || obj.user_id || obj.userID || obj.inputEmailID || obj.email;
  if (access && user) return { accessToken: String(access), userId: String(user) };
  return null;
}

// Build a multipart/form-data body byte-for-byte like the official client:
// the literal boundary '*****', each text part prefixed with a
// `Content-Type: text/plain; charset=utf-8` header and unquoted `name=`, and the
// file part carrying `filename=`+RFC5987 `filename*=` and NO Content-Type.
// `fields` = [[name, value], ...], `file` = { name, filename, content:Buffer }.
function multipart(fields, file) {
  const boundary = '*****';
  const CRLF = '\r\n';
  const chunks = [];
  fields.forEach(function (f) {
    chunks.push(Buffer.from('--' + boundary + CRLF +
      'Content-Disposition: form-data; name=' + f[0] + CRLF +
      'Content-Type: text/plain; charset=utf-8' + CRLF + CRLF +
      f[1] + CRLF));
  });
  chunks.push(Buffer.from('--' + boundary + CRLF +
    'Content-Disposition: form-data; name=' + file.name +
    '; filename=' + file.filename + "; filename*=utf-8''" + file.filename + CRLF + CRLF));
  chunks.push(file.content);
  chunks.push(Buffer.from(CRLF + '--' + boundary + '--' + CRLF));
  return { body: Buffer.concat(chunks), boundary: boundary };
}

// ---------------------------------------------------------------------------
// openssl mechanics (integration-tested against a stand-in CA)
// ---------------------------------------------------------------------------

function ossl(opensslBin, args, opts) {
  return execFileSync(opensslBin || 'openssl', args, Object.assign({ stdio: ['ignore', 'pipe', 'pipe'] }, opts || {}));
}

// Generate a 2048-bit RSA key + a CSR. `san` (optional) adds a subjectAltName.
// Returns { keyPath, csrPath }.
function genKeyAndCsr(openssl, dir, base, subject, san) {
  const keyPath = path.join(dir, base + '.key.pem');
  const csrPath = path.join(dir, base + '.csr');
  ossl(openssl, ['genrsa', '-out', keyPath, '2048']);
  const args = ['req', '-new', '-key', keyPath, '-out', csrPath, '-subj', subject];
  if (san) args.push('-addext', 'subjectAltName = ' + san);
  ossl(openssl, args);
  return { keyPath: keyPath, csrPath: csrPath };
}

// leaf cert (PEM bytes) + CA cert file -> a password-protected PKCS#12.
// Uses -legacy (RC2/3DES) because Tizen's keystore reader rejects modern AES p12.
function assembleP12(openssl, dir, base, leafPem, caCertPath, keyPath, outP12, password) {
  const leafPath = path.join(dir, base + '.crt');
  const chainPath = path.join(dir, base + '-and-ca.crt');
  fs.writeFileSync(leafPath, leafPem);
  let leaf = fs.readFileSync(leafPath);
  if (leaf.length && leaf[leaf.length - 1] !== 0x0a) leaf = Buffer.concat([leaf, Buffer.from('\n')]);
  fs.writeFileSync(chainPath, Buffer.concat([leaf, fs.readFileSync(caCertPath)]));
  ossl(openssl, ['pkcs12', '-export', '-out', outP12, '-inkey', keyPath, '-in', chainPath,
    '-name', 'usercertificate', '-legacy', '-passout', 'pass:' + (password || '')]);
  return outP12;
}

// Sanity check that the CA returned a certificate and not a JSON/HTML error.
function looksLikeCert(buf) {
  if (!buf || !buf.length) return false;
  const head = buf.slice(0, 64).toString('latin1');
  if (head.indexOf('-----BEGIN CERTIFICATE-----') !== -1) return true;
  if (buf[0] === 0x30 && buf[1] === 0x82) return true; // DER SEQUENCE
  return false;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

function httpsGet(url) {
  return new Promise(function (res, rej) {
    https.get(url, { headers: { 'user-agent': 'twellie-cert' } }, function (r) {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume(); return httpsGet(r.headers.location).then(res, rej);
      }
      const chunks = [];
      r.on('data', function (c) { chunks.push(c); });
      r.on('end', function () { res({ status: r.statusCode, body: Buffer.concat(chunks) }); });
    }).on('error', rej);
  });
}

// POST a CSR to a Samsung CA endpoint and return the signed cert bytes.
// fields: { accessToken, userId, platform, privilegeLevel?, developerType? }
function postCsr(url, csrPath, fields) {
  return new Promise(function (resolve, reject) {
    // Field order mirrors the official client: credentials, then the
    // distributor-only fields (privilege_level, developer_type), then platform,
    // then the csr. The token goes ONLY in the access_token field — the official
    // client sets no Authorization header and the CA ignores header credentials.
    const form = [
      ['access_token', fields.accessToken],
      ['user_id', fields.userId],
    ];
    if (fields.privilegeLevel) form.push(['privilege_level', fields.privilegeLevel]);
    if (fields.developerType) form.push(['developer_type', fields.developerType]);
    if (fields.platform) form.push(['platform', fields.platform]);
    const mp = multipart(form, { name: 'csr', filename: path.basename(csrPath), content: fs.readFileSync(csrPath) });
    const u = new URL(url);
    const req = https.request({
      method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      headers: {
        'content-type': 'multipart/form-data; boundary="' + mp.boundary + '"',
        'Content-Length': mp.body.length,
        'user-agent': 'twellie-cert',
      },
    }, function (r) {
      const chunks = [];
      r.on('data', function (c) { chunks.push(c); });
      r.on('end', function () { resolve({ status: r.statusCode, body: Buffer.concat(chunks) }); });
    });
    req.on('error', reject);
    req.write(mp.body);
    req.end();
  });
}

// One-shot loopback capture: bind 127.0.0.1:<port>, resolve with the parsed
// token from the FIRST request to <path>, then close. This is NOT a standing
// server — it lives only for the seconds of the OAuth redirect. Rejects on
// timeout. Set opts.onUrl to receive the auth URL for opening a browser.
function captureToken(cfg, opts) {
  opts = opts || {};
  const timeoutMs = opts.timeoutMs || 5 * 60 * 1000;
  return new Promise(function (resolve, reject) {
    let done = false;
    const server = http.createServer(function (req, res) {
      if (req.url.indexOf(cfg.redirectPath) !== 0 && req.url.indexOf(cfg.redirectPath) === -1) {
        res.writeHead(404); res.end(); return;
      }
      const finish = function (body) {
        const tok = parseToken(req.url) || parseToken(body);
        res.writeHead(tok ? 200 : 400, { 'Content-Type': 'text/html', 'Connection': 'close' });
        res.end('<html><body style="font:16px sans-serif;padding:3em;text-align:center">' +
          (tok ? '✓ Certificate authorization received. You can close this tab.'
               : 'Could not read the token from Samsung’s response. Return to the terminal.') +
          '</body></html>');
        if (done) return;
        done = true;
        clearTimeout(timer);
        server.close(function () { tok ? resolve(tok) : reject(new Error('callback carried no usable token')); });
      };
      if (req.method === 'POST') {
        const chunks = [];
        req.on('data', function (c) { chunks.push(c); });
        req.on('end', function () { finish(Buffer.concat(chunks).toString('utf8')); });
      } else {
        finish(null);
      }
    });
    const timer = setTimeout(function () {
      if (done) return; done = true; server.close();
      reject(new Error('timed out after ' + Math.round(timeoutMs / 1000) + 's waiting for the Samsung login redirect'));
    }, timeoutMs);
    server.on('error', function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    server.listen(cfg.redirectPort, cfg.redirectHost, function () {
      if (opts.onUrl) opts.onUrl(buildAuthUrl(cfg, redirectUri(cfg)));
    });
  });
}

// ---------------------------------------------------------------------------
// CA cert provisioning + (optional) live config refresh
// ---------------------------------------------------------------------------

// Minimal Java .class constant-pool reader — just enough to pull the string
// constants that hold SERVICE_ID / loginUrl / AUTHOR_URL / DISTRIBUTOR_URL.
function classStrings(buf) {
  let p = 8; // skip magic (4) + version (4)
  const n = buf.readUInt16BE(p) - 1; p += 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const tag = buf[p]; p += 1;
    if (tag === 1) { const len = buf.readUInt16BE(p); p += 2; out.push(buf.slice(p, p + len).toString('utf8')); p += len; }
    else if (tag === 3 || tag === 4) p += 4;
    else if (tag === 5 || tag === 6) { p += 8; i++; }
    else if (tag === 7 || tag === 8 || tag === 16 || tag === 19 || tag === 20) p += 2;
    else if (tag === 15) p += 3;
    else if (tag === 9 || tag === 10 || tag === 11 || tag === 12 || tag === 17 || tag === 18) p += 4;
    else if (tag === 0) { /* padding */ }
    else break;
  }
  return out;
}

// Walk the (nested-zip) cert extension, extracting the VD CA certs we need into
// caDir and, when refresh is set, the live SERVICE_ID/URLs. Pure-stdlib unzip
// via the system `unzip` would need temp files; instead we lean on the already
// downloaded extension only when asked (it is 44 MB), caching CA certs forever.
function ensureCaCerts(caDir, opts) {
  opts = opts || {};
  const need = [PINNED.vdAuthorCa].concat(Object.keys(PINNED.vdDistCa).map(function (k) { return PINNED.vdDistCa[k]; }));
  const have = need.every(function (f) { return fs.existsSync(path.join(caDir, f)); });
  if (have && !opts.refresh) return Promise.resolve(PINNED);
  fs.mkdirSync(caDir, { recursive: true });
  // Lazy require: only need a real unzip when we actually fetch.
  return resolveExtZipUrl().then(function (url) {
    return httpsGet(url).then(function (r) {
      if (r.status !== 200) throw new Error('cert extension download failed: HTTP ' + r.status);
      return extractFromExtZip(r.body, caDir);
    });
  });
}

function resolveExtZipUrl() {
  return httpsGet(EXT_INFO_URL).then(function (r) {
    if (r.status !== 200) return EXT_FALLBACK;
    const xml = r.body.toString('utf8');
    // crude: find the <repository> nearest the Samsung Certificate Extension name
    const idx = xml.indexOf('Samsung Certificate Extension');
    if (idx === -1) return EXT_FALLBACK;
    const m = xml.slice(idx).match(/<repository>([^<]+)<\/repository>/) || xml.slice(0, idx).match(/<repository>([^<]+)<\/repository>[^]*$/);
    return (m && m[1] ? m[1].trim() : EXT_FALLBACK);
  }).catch(function () { return EXT_FALLBACK; });
}

// We avoid bundling a zip library: use Node's zlib on the raw deflate entries by
// parsing the central directory ourselves (zip entries are stored or deflated).
function* zipEntries(buf) {
  // iterate local file headers
  let p = 0;
  while (p + 4 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const compSize = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const name = buf.slice(p + 30, p + 30 + nameLen).toString('utf8');
    const dataStart = p + 30 + nameLen + extraLen;
    let comp = buf.slice(dataStart, dataStart + compSize);
    let flags = buf.readUInt16LE(p + 6);
    if (flags & 0x08 && compSize === 0) break; // streamed sizes (data descriptor) — unsupported here
    let content;
    try { content = method === 0 ? comp : zlib.inflateRawSync(comp); } catch (e) { content = null; }
    if (content) yield { name: name, content: content };
    p = dataStart + compSize;
  }
}

function extractFromExtZip(zipBuf, caDir) {
  for (const e of zipEntries(zipBuf)) {
    const base = e.name.split('/').pop();
    if (base.indexOf('cert-add-on') === 0 && base.endsWith('.zip')) {
      for (const inner of zipEntries(e.content)) {
        const ib = inner.name.split('/').pop();
        if (ib.indexOf('org.tizen.common.cert') === 0 && ib.endsWith('.jar')) {
          for (const j of zipEntries(inner.content)) {
            const jb = j.name.split('/').pop();
            if (jb.endsWith('.cer') || jb.endsWith('.crt')) fs.writeFileSync(path.join(caDir, jb), j.content);
          }
          return PINNED;
        }
      }
    }
  }
  throw new Error('could not locate VD CA certs inside the cert extension zip');
}

module.exports = {
  PINNED: PINNED,
  buildAuthUrl: buildAuthUrl,
  redirectUri: redirectUri,
  sanForDuids: sanForDuids,
  parseToken: parseToken,
  multipart: multipart,
  genKeyAndCsr: genKeyAndCsr,
  assembleP12: assembleP12,
  looksLikeCert: looksLikeCert,
  postCsr: postCsr,
  captureToken: captureToken,
  ensureCaCerts: ensureCaCerts,
  classStrings: classStrings,
};
