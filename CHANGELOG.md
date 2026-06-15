# Changelog

All notable changes to this project. Versions `1.0`–`3.7` predate this file and
live in the git tags.

## [4.0.0] — 2026 · The Revival

The app had been non-functional since Twitch shut down the Kraken API in
February 2022. This is a ground-up rewrite.

### Changed
- **Rebuilt the entire Twitch integration.** Off the dead Kraken v5 API onto
  Twitch's public **GraphQL** (no backend, no API key): browse + the live
  `PlaybackAccessToken` → usher playback flow.
- **Re-architected into a shared ES5 core + thin platform adapters.** The old
  app was welded to Samsung's AppsFramework (`sf.scene`/`sf.key`/IMEShell);
  that's now a portable scene manager, key map and player contract.
- **Dropped jQuery** and every other dependency. Hand-written ES5 + a tiny
  polyfill for old Orsay WebKit.

### Added
- **Tizen (2015+) target** — AVPlay player, `.wgt` packaging, key registration.
  The original could never run past 2014.
- **Browser dev-harness** — run and play live Twitch on a laptop with no TV.
- **Live chat overlay** — anonymous IRC-over-WebSocket, rendered over the video
  (the GREEN button); no login, no proxy, works on every target.
- **Per-channel VODs & clips** — GraphQL browse + playback (VOD via usher HLS,
  clips via their signed progressive MP4).
- **Optional login** — Twitch device-code grant (scan a QR or enter the code on
  your phone), unlocking your followed channels via Helix. Twellie ships a
  registered public Client-ID; no backend, no secret; tokens stay on the device.
  See [docs/LOGIN.md](docs/LOGIN.md).
- **One-time Orsay installer** — a self-contained app (bundles a signed copy of
  Node) that sideloads Twellie onto 2013–2014 Orsay TVs over App-Sync.
- **Unit tests** (`node --test`, zero deps) and an **ES5 linter**.
- **Docs** — architecture, platform matrix, and a no-TV testing guide.

### Removed
- The abandoned NaCl C++ "WebIRC" chat stub and the old static HTML prototype.
- Eclipse / Samsung SDK workspace cruft and the bundled jQuery copy.

[4.0.0]: https://github.com/nikitakatchik/smarttv-twitch/releases/tag/4.0.0
