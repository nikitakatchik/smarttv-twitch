'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const { EventEmitter } = require('events');
const { proxyHttp, rewriteM3u8, CORS } = require('../tools/lib/dev-proxy');

function req(headers) {
  const r = new EventEmitter();
  r.method = 'GET';
  r.headers = headers || {};
  return r;
}

function res() {
  return {
    status: 0,
    headers: {},
    body: null,
    done: null,
    promise: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
      this.done();
    },
  };
}

function makeRes() {
  const r = res();
  r.promise = new Promise((resolve) => { r.done = resolve; });
  return r;
}

async function withHttpsResponse(response, fn) {
  const orig = https.request;
  const calls = [];
  https.request = function (options, cb) {
    const upstreamReq = new EventEmitter();
    calls.push(options);
    upstreamReq.write = function () {};
    upstreamReq.end = function () {
      const upstreamRes = new EventEmitter();
      upstreamRes.statusCode = response.status;
      upstreamRes.headers = response.headers || {};
      cb(upstreamRes);
      upstreamRes.emit('data', Buffer.from(response.body || ''));
      upstreamRes.emit('end');
    };
    return upstreamReq;
  };
  try {
    await fn(calls);
  } finally {
    https.request = orig;
  }
}

test('dev proxy forwards byte-range requests and preserves partial-content headers', async () => {
  await withHttpsResponse({
    status: 206,
    headers: {
      'content-type': 'video/mp2t',
      'content-range': 'bytes 100-199/1000',
      'accept-ranges': 'bytes',
      'content-length': '100',
    },
    body: 'segment',
  }, async (calls) => {
    const out = makeRes();
    await proxyHttp(req({ range: 'bytes=100-199', accept: 'video/mp2t' }), out,
      'https://vod-secure.twitchcdn.net/path/seg.ts', 'http://localhost:8080');
    await out.promise;

    assert.equal(calls[0].headers.Range, 'bytes=100-199');
    assert.equal(calls[0].headers.Accept, 'video/mp2t');
    assert.equal(out.status, 206);
    assert.equal(out.headers['Content-Range'], 'bytes 100-199/1000');
    assert.equal(out.headers['Accept-Ranges'], 'bytes');
    assert.equal(out.headers['Content-Length'], '100');
    assert.equal(out.headers['Access-Control-Expose-Headers'], CORS['Access-Control-Expose-Headers']);
    assert.equal(String(out.body), 'segment');
  });
});

test('dev proxy rewrites HLS URI attributes as well as segment lines', () => {
  const body = [
    '#EXTM3U',
    '#EXT-X-MAP:URI="init.mp4"',
    '#EXT-X-KEY:METHOD=AES-128,URI="https://vod-secure.twitchcdn.net/key.bin"',
    '#EXT-X-MEDIA:TYPE=AUDIO,URI=audio/index.m3u8,GROUP-ID="audio"',
    'segment.ts',
  ].join('\n');
  const out = rewriteM3u8(body, 'http://localhost:8090',
    'https://vod-secure.twitchcdn.net/vod/path/index.m3u8');

  assert.match(out, /URI="http:\/\/localhost:8090\/proxy\?url=https%3A%2F%2Fvod-secure\.twitchcdn\.net%2Fvod%2Fpath%2Finit\.mp4"/);
  assert.match(out, /URI="http:\/\/localhost:8090\/proxy\?url=https%3A%2F%2Fvod-secure\.twitchcdn\.net%2Fkey\.bin"/);
  assert.match(out, /URI=http:\/\/localhost:8090\/proxy\?url=https%3A%2F%2Fvod-secure\.twitchcdn\.net%2Fvod%2Fpath%2Faudio%2Findex\.m3u8,GROUP-ID/);
  assert.match(out, /http:\/\/localhost:8090\/proxy\?url=https%3A%2F%2Fvod-secure\.twitchcdn\.net%2Fvod%2Fpath%2Fsegment\.ts/);
});
