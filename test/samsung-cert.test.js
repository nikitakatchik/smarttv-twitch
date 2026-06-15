'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const sc = require('../tools/lib/samsung-cert');

// --- sanForDuids ------------------------------------------------------------
test('sanForDuids leads with packageid and lists each DUID', () => {
  assert.equal(sc.sanForDuids(['ABC123']), 'URI:URN:tizen:packageid=,URI:URN:tizen:deviceid=ABC123');
  assert.equal(sc.sanForDuids(['A', 'B']),
    'URI:URN:tizen:packageid=,URI:URN:tizen:deviceid=A,URI:URN:tizen:deviceid=B');
});

test('sanForDuids trims and drops blanks', () => {
  assert.equal(sc.sanForDuids([' X ', '', '  ']), 'URI:URN:tizen:packageid=,URI:URN:tizen:deviceid=X');
});

// --- buildAuthUrl / redirectUri --------------------------------------------
test('buildAuthUrl carries the service id, action and encoded redirect', () => {
  const url = sc.buildAuthUrl(sc.PINNED, sc.redirectUri(sc.PINNED));
  assert.ok(url.startsWith('https://account.samsung.com/mobile/account/check.do?'));
  assert.ok(url.includes('serviceID=' + sc.PINNED.serviceId));
  assert.ok(url.includes('actionID=StartOAuth2'));
  assert.ok(url.includes('accessToken=Y'));
  assert.ok(url.includes(encodeURIComponent('http://localhost:4794/signin/callback')));
});

// --- parseToken -------------------------------------------------------------
test('parseToken reads object, query, full URL and JSON code blob', () => {
  assert.deepEqual(sc.parseToken({ access_token: 't', userId: 'u@x' }), { accessToken: 't', userId: 'u@x' });
  assert.deepEqual(sc.parseToken('access_token=t&userId=u@x'), { accessToken: 't', userId: 'u@x' });
  assert.deepEqual(sc.parseToken('http://127.0.0.1:4794/signin/callback?access_token=t&userId=u'),
    { accessToken: 't', userId: 'u' });
  const blob = encodeURIComponent(JSON.stringify({ access_token: 't', userId: 'u' }));
  assert.deepEqual(sc.parseToken('http://x/cb?code=' + blob), { accessToken: 't', userId: 'u' });
  assert.equal(sc.parseToken('nope=1'), null);
  assert.equal(sc.parseToken(''), null);
});

// --- multipart --------------------------------------------------------------
test('multipart frames fields + a file like the official client', () => {
  const mp = sc.multipart([['access_token', 'TOK'], ['platform', 'VD']],
    { name: 'csr', filename: 'author.csr', content: Buffer.from('CSRBYTES') });
  const s = mp.body.toString('utf8');
  assert.equal(mp.boundary, '*****');                       // literal boundary
  assert.ok(s.includes('name=access_token'));               // unquoted name=
  assert.ok(s.includes('Content-Type: text/plain; charset=utf-8')); // per text part
  assert.ok(s.includes('TOK'));
  assert.ok(s.includes('name=platform'));
  assert.ok(s.includes("filename=author.csr; filename*=utf-8''author.csr"));
  assert.ok(s.includes('CSRBYTES'));
  assert.ok(s.includes('--*****--'));                       // closing boundary
});

// --- classStrings (synthetic constant pool) --------------------------------
test('classStrings extracts UTF8 constants in order', () => {
  function u8(str) {
    const b = Buffer.from(str, 'utf8');
    return Buffer.concat([Buffer.from([0x01]), Buffer.from([b.length >> 8, b.length & 0xff]), b]);
  }
  const buf = Buffer.concat([
    Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34]), // magic + version
    Buffer.from([0x00, 0x03]),                                     // pool count = 3 -> 2 entries
    u8('SERVICE_ID'), u8('v285zxnl3h'),
  ]);
  assert.deepEqual(sc.classStrings(buf), ['SERVICE_ID', 'v285zxnl3h']);
});

// --- looksLikeCert ----------------------------------------------------------
test('looksLikeCert accepts PEM/DER, rejects JSON errors', () => {
  assert.equal(sc.looksLikeCert(Buffer.from('-----BEGIN CERTIFICATE-----\nMII...')), true);
  assert.equal(sc.looksLikeCert(Buffer.from([0x30, 0x82, 0x01, 0x02])), true);
  assert.equal(sc.looksLikeCert(Buffer.from('{"error":"invalid_token"}')), false);
  assert.equal(sc.looksLikeCert(Buffer.alloc(0)), false);
});

// --- full openssl round-trip against a stand-in CA --------------------------
// Proves genKeyAndCsr (with the DUID SAN) -> sign -> assembleP12 yields a real,
// loadable PKCS#12 carrying the DUID. Only the live Samsung POST is mocked (by a
// local CA standing in for svdca.samsungqbe.com).
test('openssl pipeline produces a loadable p12 carrying the DUID', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twellie-cert-'));
  try {
    // stand-in CA
    const caKey = path.join(dir, 'ca.key'), caCrt = path.join(dir, 'ca.crt');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', caKey, '-out', caCrt, '-subj', '/CN=Stand-in VD CA', '-days', '2'], { stdio: 'ignore' });

    // our distributor key + CSR with the DUID SAN
    const san = sc.sanForDuids(['TESTDUID0001ABCD']);
    const k = sc.genKeyAndCsr('openssl', dir, 'twellie-distributor', '/CN=TizenSDK/emailAddress=me@x.com', san);
    assert.ok(fs.existsSync(k.csrPath));

    // CA signs the CSR, copying the SAN through (what Samsung's CA does for us)
    const signed = path.join(dir, 'signed.crt');
    execFileSync('openssl', ['x509', '-req', '-in', k.csrPath, '-CA', caCrt, '-CAkey', caKey,
      '-CAcreateserial', '-out', signed, '-days', '2', '-copy_extensions', 'copyall'], { stdio: 'ignore' });
    const signedText = execFileSync('openssl', ['x509', '-in', signed, '-noout', '-text']).toString();
    assert.ok(signedText.includes('TESTDUID0001ABCD'), 'DUID should survive into the signed cert SAN');

    // assemble the p12 and confirm it loads (legacy, password-less)
    const p12 = path.join(dir, 'distributor.p12');
    sc.assembleP12('openssl', dir, 'twellie-distributor', fs.readFileSync(signed), caCrt, k.keyPath, p12, '');
    assert.ok(fs.existsSync(p12));
    execFileSync('openssl', ['pkcs12', '-in', p12, '-passin', 'pass:', '-nodes', '-legacy', '-noout'], { stdio: 'ignore' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- one-shot loopback token capture ---------------------------------------
test('captureToken grabs the token from a loopback redirect then closes', async () => {
  const cfg = Object.assign({}, sc.PINNED, { redirectHost: 'localhost', redirectPort: 47941 });
  const got = sc.captureToken(cfg, { timeoutMs: 4000 });
  // simulate the browser landing on the callback once the listener is up
  await new Promise((r) => setTimeout(r, 150));
  await new Promise((resolve, reject) => {
    http.get('http://localhost:47941/signin/callback?access_token=LIVE&userId=me@x.com',
      (res) => { res.resume(); res.on('end', resolve); }).on('error', reject);
  });
  assert.deepEqual(await got, { accessToken: 'LIVE', userId: 'me@x.com' });
});
