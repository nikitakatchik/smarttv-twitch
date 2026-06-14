'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./_load');

// A minimal WebSocket stand-in so we can drive connect() without a network.
function makeWS() {
  function WS(url) { this.url = url; this.sent = []; WS.last = this; }
  WS.prototype.send = function (s) { this.sent.push(s); };
  WS.prototype.close = function () { this.closed = true; };
  return WS;
}

function load(extra) {
  return loadCore(['core/polyfill.js', 'core/util.js', 'core/twitch/chat.js'], extra);
}

test('parseLine pulls tags, nick, command, channel and text from a PRIVMSG', () => {
  const { TW } = load();
  const line = '@badges=moderator/1;color=#FF0000;display-name=Ronni;mod=1;subscriber=0 ' +
    ':ronni!ronni@ronni.tmi.twitch.tv PRIVMSG #dallas :Hello, world!';
  const m = TW.twitch.chat.parseLine(line);
  assert.equal(m.command, 'PRIVMSG');
  assert.equal(m.channel, 'dallas');
  assert.equal(m.text, 'Hello, world!');
  assert.equal(m.nick, 'ronni');
  assert.equal(m.tags['display-name'], 'Ronni');
  assert.equal(m.tags.color, '#FF0000');
  assert.equal(m.tags.mod, '1');
});

test('parseLine keeps a colon inside the message body', () => {
  const { TW } = load();
  const m = TW.twitch.chat.parseLine(':a!a@a.tmi.twitch.tv PRIVMSG #c :look at this :) 5:30');
  assert.equal(m.text, 'look at this :) 5:30');
});

test('parseLine recognises a server PING', () => {
  const { TW } = load();
  const m = TW.twitch.chat.parseLine('PING :tmi.twitch.tv');
  assert.equal(m.command, 'PING');
});

test('connect sends the anonymous handshake and JOINs the channel', () => {
  const WS = makeWS();
  const { TW } = load({ WebSocket: WS });
  TW.twitch.chat.connect('dallas', {});
  WS.last.onopen();
  const joined = WS.last.sent.join('\n');
  assert.match(joined, /CAP REQ :twitch\.tv\/tags/);
  assert.match(joined, /NICK justinfan\d+/);
  assert.match(joined, /JOIN #dallas/);
  // Anonymous: never authenticates with a PASS.
  assert.doesNotMatch(joined, /PASS/);
});

test('connect surfaces a PRIVMSG to onMessage and answers PING with PONG', () => {
  const WS = makeWS();
  const { TW } = load({ WebSocket: WS });
  const got = [];
  TW.twitch.chat.connect('dallas', { onMessage: (m) => got.push(m) });
  WS.last.onopen();
  WS.last.onmessage({ data: '@display-name=Foo;color=#00FF00 :foo!foo@foo.tmi.twitch.tv PRIVMSG #dallas :hi there\r\n' });
  assert.equal(got.length, 1);
  assert.equal(got[0].nick, 'Foo');
  assert.equal(got[0].color, '#00FF00');
  assert.equal(got[0].text, 'hi there');

  WS.last.onmessage({ data: 'PING :tmi.twitch.tv\r\n' });
  assert.match(WS.last.sent.join('\n'), /PONG :tmi\.twitch\.tv/);
});

test('connect returns a no-op handle when WebSocket is unavailable', () => {
  const { TW } = load({ WebSocket: undefined });
  let failed = null;
  const h = TW.twitch.chat.connect('dallas', { onError: (r) => { failed = r; } });
  assert.equal(failed, 'no-websocket');
  assert.equal(typeof h.close, 'function');
  h.close(); // must not throw
});
