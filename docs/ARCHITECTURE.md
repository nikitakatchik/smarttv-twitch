# 🏗️ Architecture

```
                      ┌─────────────────────────────────────────┐
                      │                core/ (ES5)               │
                      │  app · scene-manager · scenes · keys ·   │
                      │  i18n · dom · http · twitch/{api,gql,     │
                      │  helix,usher,playlist}                   │
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
the **adapter** — so the browser harness, a 2011 Orsay TV and a 2024 Tizen TV
all run byte-for-byte the same `core/`.

## Module loading

No bundler, no ES modules — a 2011 WebKit can't do either. Every file is an
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
scene → TW.api.topStreams(cursor) → backend (gql | helix) → normalized items
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
The rebuild uses two interchangeable backends:

- **GraphQL (default, no backend).** `gql.twitch.tv` with the public web
  Client-ID — the Streamlink/yt-dlp approach. Browse + the live
  `PlaybackAccessToken` with no user login. Verified working 2026.
- **Helix (official).** Requires `Client-Id` + OAuth `Bearer` on every call,
  so the secret lives in the [relay/worker](../proxy/), never the client.

Three hosts behave differently, and the design follows the measured reality:

| Host | CORS for a non-Twitch browser origin | Old-TV TLS (no SNI) |
| ---- | ------------------------------------ | ------------------- |
| `gql.twitch.tv` | `Access-Control-Allow-Origin: *` ✅ | ❌ needs relay |
| `usher.ttvnw.net` | no ACAO ❌ | ❌ needs relay |
| `*.playlist.ttvnw.net` | **403** for non-Twitch origins ❌ | ❌ needs relay |
| `*.cloudfront.hls.ttvnw.net` (segments) | `*` ✅ | ❌ needs relay |

**Native players (AVPlay, INFOLINK) send no browser `Origin`**, so they sail
past the CORS gates — which is why Tizen plays Twitch directly. **Browsers and
old no-SNI TVs don't**, so they go through the relay, whose key trick is
**rewriting the m3u8 playlists** so every nested fetch (variant playlist,
segment) routes back through the relay too. That single mechanism makes the
harness, a 2011 D-series and a Helix deployment all work.

See [the proxy README](../proxy/README.md) and
[`twitch-tv-verified-facts`](PLATFORMS.md) for the measurements.
