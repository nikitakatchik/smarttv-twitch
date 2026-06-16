/*
 * tools/lib/dev-proxy.js — DEV-ONLY CORS proxy for the browser harness.
 *
 * Only the dev server (tools/dev-server.js, `npm start`) uses this. Browsers
 * enforce CORS that native TV players don't, and Twitch's usher/playlist hosts
 * send no Access-Control-Allow-Origin — so the harness can't fetch the HLS
 * chain directly. This forwards the request server-side and rewrites HLS
 * playlist bodies so every nested fetch (variant playlists, segments) routes
 * back through the proxy too. NOT shipped in any TV build; real TVs play direct.
 *
 * Uses Node's https module (not global fetch) to avoid the ExperimentalWarning
 * on older Node, and keeps an allowlist so it isn't an open proxy.
 */
'use strict';

const https = require('https');

// twitchcdn.net + cloudfront.net cover VOD segments and clip MP4 hosts.
const ALLOWED = ['ttvnw.net', 'twitch.tv', 'jtvnw.net', 'twitchcdn.net', 'cloudfront.net'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Client-ID, Client-Id, Content-Type, Authorization, Range, Accept',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
};

function hostAllowed(h) {
  for (let i = 0; i < ALLOWED.length; i++) {
    const d = ALLOWED[i];
    if (h === d || h.slice(-(d.length + 1)) === '.' + d) { return true; }
  }
  return false;
}

function rewriteM3u8(text, selfBase, baseUrl) {
  const NL = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  const lines = text.split(NL);
  const out = [];
  function proxied(uri) {
    let abs;
    try { abs = new URL(uri, baseUrl).href; } catch (e) { return uri; }
    return selfBase + '/proxy?url=' + encodeURIComponent(abs);
  }
  function rewriteAttrs(line) {
    return line.replace(/URI=("([^"]+)"|([^,]+))/g, (m, raw, quoted, bare) => {
      const uri = quoted || bare;
      const out = proxied(uri);
      return quoted ? 'URI="' + out + '"' : 'URI=' + out;
    });
  }
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.charAt(line.length - 1) === CR) { line = line.slice(0, -1); }
    if (line && line.charAt(0) !== '#') {
      out.push(proxied(line));
    } else {
      out.push(rewriteAttrs(line));
    }
  }
  return out.join(NL);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function fetchUpstream(target, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    const r = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: method, headers: headers, port: 443 },
      (resp) => {
        const chunks = [];
        resp.on('data', (c) => chunks.push(c));
        resp.on('end', () => resolve({
          status: resp.statusCode,
          headers: resp.headers,
          type: resp.headers['content-type'],
          body: Buffer.concat(chunks)
        }));
      }
    );
    r.on('error', reject);
    if (body && body.length) { r.write(body); }
    r.end();
  });
}

function mediaHeaders(headers) {
  const out = {};
  if (headers['content-range']) { out['Content-Range'] = headers['content-range']; }
  if (headers['accept-ranges']) { out['Accept-Ranges'] = headers['accept-ranges']; }
  if (headers['content-length']) { out['Content-Length'] = headers['content-length']; }
  return out;
}

// Handle a GET/POST /proxy?url=<target> request on a Node http server.
async function proxyHttp(req, res, target, selfBase) {
  function send(status, body, type, extraHeaders) {
    res.writeHead(status, Object.assign({ 'Content-Type': type || 'text/plain' }, CORS, extraHeaders || {}));
    res.end(req.method === 'HEAD' ? '' : body);
  }
  let u;
  try { u = new URL(target); } catch (e) { return send(400, 'bad url'); }
  if (u.protocol !== 'https:' || !hostAllowed(u.hostname)) { return send(403, 'forbidden host'); }

  try {
    const headers = {};
    if (req.headers.accept) { headers.Accept = req.headers.accept; }
    if (req.headers['client-id']) { headers['Client-Id'] = req.headers['client-id']; }
    if (req.headers['content-type']) { headers['Content-Type'] = req.headers['content-type']; }
    if (req.headers['authorization']) { headers['Authorization'] = req.headers['authorization']; }
    if (req.headers.range) { headers.Range = req.headers.range; }
    let body = null;
    if (req.method === 'POST') {
      body = await readBody(req);
      if (body.length > 262144) { return send(413, 'payload too large'); }
    }
    const up = await fetchUpstream(target, req.method, headers, body);
    const text = up.body.length < 2000000 ? up.body.toString('utf8') : '';
    if (text.indexOf('#EXTM3U') === 0) {
      send(up.status, rewriteM3u8(text, selfBase, target), 'application/vnd.apple.mpegurl');
    } else {
      send(up.status, up.body, up.type || 'application/octet-stream', mediaHeaders(up.headers || {}));
    }
  } catch (e) {
    send(502, 'proxy error: ' + e.message);
  }
}

module.exports = { proxyHttp, hostAllowed, rewriteM3u8, CORS };
