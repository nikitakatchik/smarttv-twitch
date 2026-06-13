# Changelog

All notable changes to this project. Versions `1.0`–`3.7` predate this file and
live in the git tags.

## [4.0.0] — 2026 · The Revival

The app had been non-functional since Twitch shut down the Kraken API in
February 2022. This is a ground-up rewrite.

### Changed
- **Rebuilt the entire Twitch integration.** Off the dead Kraken v5 API onto a
  pluggable layer: public **GraphQL** (no backend) by default, official
  **Helix** (via a serverless relay) optional. Playback uses the GraphQL
  `PlaybackAccessToken` → usher flow.
- **Re-architected into a shared ES5 core + thin platform adapters.** The old
  app was welded to Samsung's AppsFramework (`sf.scene`/`sf.key`/IMEShell);
  that's now a portable scene manager, key map and player contract.
- **Dropped jQuery** and every other dependency. Hand-written ES5 + a tiny
  polyfill for the 2011 MAPLE engine.

### Added
- **Tizen (2015+) target** — AVPlay player, `.wgt` packaging, key registration.
  The original could never run past 2014.
- **Browser dev-harness** — run and play live Twitch on a laptop with no TV.
- **Serverless relay / Helix token broker** (`proxy/`) — also the TLS/CORS
  bridge that lets pre-2017 TVs reach Twitch at all.
- **Unit tests** (`node --test`, zero deps) and an **ES5 linter**.
- **Docs** — architecture, platform matrix, and a no-TV testing guide.

### Removed
- The abandoned NaCl C++ "WebIRC" chat stub and the old static HTML prototype.
- Eclipse / Samsung SDK workspace cruft and the bundled jQuery copy.

[4.0.0]: https://github.com/nikitakatchik/smarttv-twitch/releases/tag/4.0.0
