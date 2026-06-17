# 📺 Supported generations

One ES5 core, four runtime adapters, spanning **Samsung Smart TVs from 2013 on**
— Orsay (2013–14) installs directly, Tizen (2015+) installs via Apps2Samsung (a
native `.wgt`) or TizenBrew (a web module). The split is dictated by Samsung's own
platform history: the 2015 switch from the in-house *Orsay/Maple* stack to *Tizen*
changed the player, the key codes, the packaging and the JS engine all at once.

| Year | Series | Platform | Player | Engine | Reaches Twitch via | Status |
| ---- | ------ | -------- | ------ | ------ | ------------------ | ------ |
| 2013 | F | Orsay | `INFOLINK` / SEF | WebKit ~535 | direct | ✅ best-effort |
| 2014 | H | Orsay | `INFOLINK` | WebKit 537 | direct | ✅ best-effort |
| 2015–16 | J/K | Tizen 2.3–2.4 | AVPlay (`.wgt`) | Chromium WebView | Apps2Samsung | ✅ (TizenBrew shaky: draft MSE) |
| 2017 | M | Tizen 3.0 | AVPlay (`.wgt`) · hls.js | Chromium M47 | Apps2Samsung · TizenBrew | ✅ |
| 2018 | N | Tizen 4.0 | AVPlay (`.wgt`) · hls.js | Chromium | Apps2Samsung · TizenBrew | ✅ |
| 2019+ | R/T/U/… | Tizen 5–9 | AVPlay (`.wgt`) · hls.js | Chromium | Apps2Samsung · TizenBrew | ✅ |
| any | — | **Hosted web preview** | Twitch embed · `<video>` | Chrome/FF/Safari | Twitch embed | 🧪 demo |
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

On Tizen there are two install paths:

- **Apps2Samsung** (2015+, recommended) installs a native `.wgt` that plays via the
  privileged **AVPlay** — no browser `Origin`, modern TLS, reaches Twitch directly.
  Browse/auth/chat still run in the Tizen WebView, so the package declares both
  the `internet` privilege and `<access origin="*" subdomains="true">` in
  `config.xml` for Twitch and dynamically selected CDN hosts.
  Apps2Samsung mints a per-TV Samsung cert and re-signs the package for you (see
  [install/apps2samsung.md](install/apps2samsung.md)); AVPlay needs no MSE, so it
  works on older sets too.
- **TizenBrew** (2017+) loads a web module that plays via **hls.js**. No `.wgt`,
  but hls.js needs MSE (reliable 2017+; 2015–16 draft MSE is best-effort), and it
  fetches Twitch under TizenBrew's `<access origin="*">` privilege.

Only the **browser harness** is hard CORS-bound: desktop browsers enforce CORS
that the TV WebViews relax, and Twitch's usher/playlist hosts send no
`Access-Control-Allow-Origin`, so `npm start` routes HLS playback through a small
**dev-only CORS proxy** in the dev server (`tools/lib/dev-proxy.js`). GitHub
Pages cannot host that endpoint, so the hosted preview uses Twitch's official
embed for live/VOD playback and direct `<video>` for signed clip MP4s. Orsay
plays direct and Tizen plays through the TizenBrew WebView.

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

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.
