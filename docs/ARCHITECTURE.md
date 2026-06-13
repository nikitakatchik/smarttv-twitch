# 🏗️ Architecture

```
                      ┌─────────────────────────────────────────┐
                      │                core/ (ES5)               │
                      │  app · scene-manager · scenes · keys ·   │
                      │  i18n · dom · http · twitch/{api,gql,     │
                      │  usher,playlist}                         │
                      └───────────────┬─────────────────────────┘
                                      │ depends only on an "adapter"
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
  platforms/orsay/             platforms/tizen/             platforms/web/
  INFOLINK player              AVPlay player                hls.js player
  Maple keycodes               Tizen keys + registerKey     keyboard + D-pad
  Common API system            tizen.application            (harness)
```

The core is **platform-agnostic ES5** and talks to exactly one abstraction —
the **adapter** — so the browser harness, a 2013 Orsay TV and a 2024 Tizen TV
all run byte-for-byte the same `core/`.

## Module loading

No bundler, no ES modules — a 2013 Orsay WebKit can't do either. Every file is an
IIFE that hangs off a global `TW` object, loaded with ordered `<script>` tags.
`tools/build.js` copies `core/ ui/ lang/ assets/` plus one platform's files
into `dist/<platform>/` with a stable relative layout (`core/`, `ui/`, `lang/`,
`assets/`, `platform/`), which the dev server mirrors so dev and packaged builds
use identical paths.

## The adapter contract

```js
adapter = {
  name,                              // 'orsay' | 'tizen' | 'web'
  config,                            // optional TW.config overrides
  keys:   { map(domEvent), register? },
  createPlayer(callbacks) -> player, // load/stop/setDisplayArea/getQualities/selectQuality
  system: { setScreensaver, setVolumeControl, exit },
  ime:    { edit(input, opts, done) }
}
```

## Data flow: browse

```
scene → TW.api.topStreams(cursor) → backend (gql) → normalized items
                                                              { login, title, viewers, thumb, … }
```

`TW.api` picks the backend from `config.api.backend`. Both backends return the
same normalized shape, so the scenes never see Twitch's wire format.

## Data flow: playback

```
scene → TW.api.playbackUrl(channel)
          └─ gql PlaybackAccessToken {value, signature}   (no user login)
          └─ build usher master URL
        → player.load(masterUrl)
          ├─ web:   hls.js parses master, exposes levels
          ├─ tizen: AVPlay plays master, getTotalTrackInfo for quality
          └─ orsay: parse master ourselves, play Auto=master / else variant URL
```

Quality is **delegated to the player adapter** because hls.js, AVPlay and
INFOLINK each discover renditions differently — the scene only ever calls
`getQualities()` / `selectQuality(i)`.

## The Twitch integration (and the CORS/TLS reality)

The original app died when Twitch shut down the **Kraken v5 API (Feb 2022)**.
The rebuild talks to **Twitch's public GraphQL** (`gql.twitch.tv` with the
public web Client-ID — the Streamlink/yt-dlp approach): browse + the live
`PlaybackAccessToken` with no user login, no API key, no backend. Verified
working 2026.

Twitch's hosts behave differently in a browser, which is the whole reason the
dev harness needs help — TVs don't, because native players send no `Origin`:

| Host | CORS for a non-Twitch browser origin |
| ---- | ------------------------------------ |
| `gql.twitch.tv` | `Access-Control-Allow-Origin: *` ✅ |
| `usher.ttvnw.net` | no ACAO ❌ |
| `*.playlist.ttvnw.net` | **403** for non-Twitch origins ❌ |
| `*.cloudfront.hls.ttvnw.net` (segments) | `*` ✅ |

**Native players (AVPlay, INFOLINK) send no browser `Origin`**, so they sail
past the CORS gates and play Twitch directly — Tizen and Orsay both. Only the
**browser harness** is CORS-bound, so `npm start` routes HLS playback through a
small **dev-only CORS proxy** (`tools/lib/dev-proxy.js`), whose key trick is
**rewriting the m3u8 playlists** so every nested fetch (variant playlist,
segment) routes back through it too. Nothing ships it.

See [`docs/PLATFORMS.md`](PLATFORMS.md) for the measured per-host behaviour.
