# 📺 Supported generations

One ES5 core, three runtime adapters, **every Samsung Smart TV from 2013 to
today**. The split is dictated by Samsung's own platform history: the 2015
switch from the in-house *Orsay/Maple* stack to *Tizen* changed the player,
the key codes, the packaging and the JS engine all at once.

| Year | Series | Platform | Player | Engine | Reaches Twitch via | Status |
| ---- | ------ | -------- | ------ | ------ | ------------------ | ------ |
| 2013 | F | Orsay | `INFOLINK` / SEF | WebKit ~535 | direct | ✅ best-effort |
| 2014 | H | Orsay | `INFOLINK` | WebKit 537 | direct | ✅ best-effort |
| 2015 | J | Tizen 2.3 | `webapis.avplay` | Chromium WebView | direct | ✅ |
| 2016 | K | Tizen 2.4 | `avplay` | Chromium | direct | ✅ |
| 2017 | M | Tizen 3.0 | `avplay` | Chromium | direct | ✅ |
| 2018 | N | Tizen 4.0 | `avplay` | Chromium | direct | ✅ |
| 2019+ | R/T/U/… | Tizen 5–9 | `avplay` | Chromium | direct | ✅ |
| any | — | **Browser harness** | hls.js | Chrome/FF/Safari | dev CORS proxy | 🧪 dev/test |

> **Dropped: 2011–2012 (D/E).** The D-series runs MAPLE (Gecko 1.8.1, no native
> `JSON`) and both D/E have TLS stacks too old to ever reach modern Twitch — the
> weakest, least reliable targets. Support now starts at 2013 (F).

## Reaching Twitch

Modern Twitch is HTTPS-only with current TLS 1.2 ciphers. A 2013–2014 Orsay
panel's TLS is borderline — **most firmware reaches `gql.twitch.tv` /
`usher.ttvnw.net` directly, but the oldest may not** (we can't verify every
build without the hardware). The app connects **directly**; a set whose TLS
can't isn't supported.

Tizen TVs run a modern Chromium WebView for the UI and the native AVPlay for
video, both of which speak modern TLS and (for AVPlay) send no browser `Origin`
header — so they just work.

Only the **browser harness** needs help: browsers enforce CORS that TVs don't,
and Twitch's usher/playlist hosts send no `Access-Control-Allow-Origin`, so
`npm start` routes HLS playback through a small **dev-only CORS proxy** in the
dev server (`tools/lib/dev-proxy.js`). Nothing ships it; real TVs play direct.

## Engine constraints (why everything is hand-written ES5)

The 2013–2014 Orsay sets run an old WebKit (~535–537, no ES6 — no
arrow/`let`/`const`/`Promise`/`classList`). The whole codebase is ES5 and ships
[`core/polyfill.js`](../src/core/polyfill.js) to backfill stragglers defensively;
`npm run lint` fails the build if any ES6 sneaks into the TV-targeted trees. The
exact same bundle then runs unmodified on a 2024 Tizen WebView.

## What each adapter supplies

A platform adapter is the only TV-specific surface (`src/platforms/<name>/`):

- **player** — `load / stop / setDisplayArea / getQualities / selectQuality`
- **keys** — native keyCode → canonical key (`UP`, `RED`, `ENTER`, …)
- **system** — screensaver, volume, exit
- **ime** — on-screen keyboard for the "Open channel" field

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.
