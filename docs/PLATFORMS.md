# 📺 Supported generations

One ES5 core, three runtime adapters, **every Samsung Smart TV from 2011 to
today**. The split is dictated by Samsung's own platform history: the 2015
switch from the in-house *Orsay/Maple* stack to *Tizen* changed the player,
the key codes, the packaging and the JS engine all at once.

| Year | Series | Platform | Player | Engine | Reaches Twitch via | Status |
| ---- | ------ | -------- | ------ | ------ | ------------------ | ------ |
| 2011 | D | Orsay / Maple | `INFOLINK-PLAYER` | MAPLE (Gecko 1.8.1) | **relay** (no SNI, no JSON) | ✅ via relay — oldest & riskiest |
| 2012 | E | Orsay | `INFOLINK-PLAYER` | WebKit 534 | **relay** (no SNI) | ✅ via relay |
| 2013 | F | Orsay | `INFOLINK` / SEF | WebKit ~535 | **relay** (no SNI) | ✅ via relay |
| 2014 | H | Orsay | `INFOLINK` | WebKit 537 | **relay** (no SNI) | ✅ via relay |
| 2015 | J | Tizen 2.3 | `webapis.avplay` | Chromium WebView | direct | ✅ |
| 2016 | K | Tizen 2.4 | `avplay` | Chromium | direct | ✅ |
| 2017 | M | Tizen 3.0 | `avplay` | Chromium | direct | ✅ |
| 2018 | N | Tizen 4.0 | `avplay` | Chromium | direct | ✅ |
| 2019+ | R/T/U/… | Tizen 5–9 | `avplay` | Chromium | direct | ✅ |
| any | — | **Browser harness** | hls.js | Chrome/FF/Safari | relay (dev server) | 🧪 dev/test |

## Why the relay line matters

Samsung TVs only gained **TLS SNI on 2017+ models**, and modern Twitch is
HTTPS/SNI-only — so a 2011–2014 panel literally cannot open a TLS socket to
`gql.twitch.tv` or `usher.ttvnw.net`. Those generations therefore **require the
[relay](../proxy/)** (which terminates modern TLS for them and rewrites the HLS
playlists). It's a one-line config in `src/platforms/orsay/boot.js`.

Tizen TVs run a modern Chromium WebView for the UI and the native AVPlay for
video, both of which speak modern TLS and (for AVPlay) send no browser `Origin`
header — so **Tizen needs nothing extra**.

## Engine constraints (why everything is hand-written ES5)

The 2011 D-series runs MAPLE, a Gecko-1.8.1 (Firefox-2-era) engine with **no
native `JSON`, no `Array.forEach`, no `Function.bind`**. The whole codebase is
ES5 and ships [`core/polyfill.js`](../src/core/polyfill.js) to backfill those on
the oldest panels; `npm run lint` fails the build if any ES6 sneaks into the
TV-targeted trees. The exact same bundle then runs unmodified on a 2024 Tizen
WebView.

## What each adapter supplies

A platform adapter is the only TV-specific surface (`src/platforms/<name>/`):

- **player** — `load / stop / setDisplayArea / getQualities / selectQuality`
- **keys** — native keyCode → canonical key (`UP`, `RED`, `ENTER`, …)
- **system** — screensaver, volume, exit
- **ime** — on-screen keyboard for the "Open channel" field

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.
