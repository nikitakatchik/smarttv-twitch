/*!
 * platforms/tizen/boot.js — start the Tizen web app.
 *
 * Tizen plays through the native AVPlay (no browser Origin), and browse hits
 * gql.twitch.tv which sends permissive CORS — so it reaches Twitch directly. The UI is
 * authored on a 1280x720 stage and scaled to the panel's 1920x1080 in
 * index.html. AVPlay still receives native panel pixels; that conversion lives
 * in platform/player.js so the scene can keep using logical UI coordinates.
 */
(function (global) {
  'use strict';

  var TW = global.TW;

  function start() {
    TW.app.start({
      name: 'tizen',
      keys: TW.platform.keys,
      createPlayer: TW.platform.createPlayer,
      system: TW.platform.system,
      log: function (m) { if (global.console) { global.console.log(m); } }
    });
  }

  if (global.document.readyState !== 'loading') { start(); }
  else { TW.dom.on(global.document, 'DOMContentLoaded', start); }
})(this);
