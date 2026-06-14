/*!
 * core/twitch/chat.js — Twitch chat over IRC-on-WebSocket (read-only, anonymous).
 *
 * This revives the project's long-abandoned IRC chat experiment — the original
 * was a dead NaCl C++ "WebIRC" stub. Modern Twitch chat is plain IRC tunnelled
 * over a WebSocket (wss://irc-ws.chat.twitch.tv), and an ANONYMOUS reader needs
 * no login: connect as a "justinfan" nick, request the tags capability (for
 * colours + display names), JOIN the channel and render incoming PRIVMSGs.
 *
 * WebSocket is available everywhere we ship — old Orsay WebKit (~535), Tizen and
 * the harness — and is NOT subject to CORS, so this works directly on every
 * target with no proxy and no helper. Reading only: we never send a PASS or
 * post messages (that would need a login + an on-screen keyboard).
 */
(function (global) {
  'use strict';

  var TW = global.TW;
  TW.twitch = TW.twitch || {};

  var IRC_WS = 'wss://irc-ws.chat.twitch.tv:443';

  function parseTags(s) {
    var tags = {};
    var parts = s.split(';');
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq < 0) { tags[parts[i]] = ''; }
      else { tags[parts[i].substring(0, eq)] = parts[i].substring(eq + 1); }
    }
    return tags;
  }

  /**
   * Parse one IRC line into { tags, nick, command, channel, text }.
   * Grammar: [@tags] [:prefix] COMMAND [params] [:trailing]
   */
  function parseLine(line) {
    var rest = line, tags = {}, nick = null;

    if (rest.charAt(0) === '@') {
      var sp = rest.indexOf(' ');
      tags = parseTags(rest.substring(1, sp));
      rest = rest.substring(sp + 1);
    }
    if (rest.charAt(0) === ':') {
      var sp2 = rest.indexOf(' ');
      var prefix = rest.substring(1, sp2);
      var bang = prefix.indexOf('!');
      nick = bang >= 0 ? prefix.substring(0, bang) : prefix;
      rest = rest.substring(sp2 + 1);
    }

    var text = null, head = rest;
    var ti = rest.indexOf(' :');
    if (ti >= 0) { text = rest.substring(ti + 2); head = rest.substring(0, ti); }
    else if (rest.charAt(0) === ':') { text = rest.substring(1); head = ''; }

    var toks = head.split(' ');
    var command = toks[0];
    var channel = null;
    for (var k = 1; k < toks.length; k++) {
      if (toks[k].charAt(0) === '#') { channel = toks[k].substring(1); break; }
    }
    return { tags: tags, nick: nick, command: command, channel: channel, text: text };
  }

  function anonNick() {
    return 'justinfan' + (10000 + Math.floor(Math.random() * 89999));
  }

  /**
   * Connect to a channel's chat. callbacks: onConnect, onMessage(msg),
   * onClose, onError(reason). msg = { nick, color, text, mod, sub }.
   * Returns a handle with .close().
   */
  function connect(channel, callbacks) {
    var cb = callbacks || {};
    var WS = global.WebSocket || global.MozWebSocket;
    if (!WS) { if (cb.onError) { cb.onError('no-websocket'); } return { close: TW.noop }; }

    var ws;
    try { ws = new WS(IRC_WS); } catch (e) { if (cb.onError) { cb.onError(String(e)); } return { close: TW.noop }; }

    function send(s) { try { ws.send(s); } catch (e) {} }

    ws.onopen = function () {
      send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      send('NICK ' + anonNick());
      send('JOIN #' + channel);
      if (cb.onConnect) { cb.onConnect(); }
    };

    ws.onmessage = function (ev) {
      var lines = String(ev.data).split('\r\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line) { continue; }
        if (line.indexOf('PING') === 0) { send('PONG :tmi.twitch.tv'); continue; }
        var m = parseLine(line);
        if (m.command === 'PRIVMSG' && m.text != null) {
          if (cb.onMessage) {
            cb.onMessage({
              nick: String(m.tags['display-name'] || m.nick || ''),
              color: m.tags.color || '',
              text: m.text,
              mod: m.tags.mod === '1',
              sub: m.tags.subscriber === '1'
            });
          }
        }
      }
    };

    ws.onerror = function () { if (cb.onError) { cb.onError('socket'); } };
    ws.onclose = function () { if (cb.onClose) { cb.onClose(); } };

    return { close: function () { try { ws.close(); } catch (e) {} } };
  }

  TW.twitch.chat = { connect: connect, parseLine: parseLine };
})(this);
