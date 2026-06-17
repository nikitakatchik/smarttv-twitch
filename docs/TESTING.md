# 🧪 Testing without a Samsung TV

You almost never need a physical TV. Here's the honest, current (2026) picture
for each generation — including the macOS-on-Apple-Silicon gotchas.

## TL;DR

| What | How | Needs a TV? |
| --- | --- | --- |
| All app logic + UI + **live playback** | `npm start` → browser harness | ❌ |
| Core logic (parser, API, i18n) | `npm test` | ❌ |
| ES5 / old-engine safety | `npm run lint` | ❌ |
| Final Tizen validation | real TV — Apps2Samsung (`.wgt`) or TizenBrew (module) | ✅ |
| Final Orsay validation | real TV (`develop` account + App-Sync) | ✅ |

> **Apple Silicon reality:** the Samsung **Tizen TV Emulator does not run on
> M-series Macs** (it needs Intel HAXM / VT-x; Rosetta doesn't help), and the
> legacy Orsay SDK emulator was an x86 VirtualBox image that's effectively dead
> today. So on a Mac the realistic paths are **the browser harness** for
> everything and **a real TV** for the final device pass.

---

## 1. The browser harness — your main test rig 🚀

```bash
npm start            # http://localhost:8080
```

This runs the **entire app** in Chrome/Firefox/Safari with:

- live Twitch browse (top streams, games, search-by-open),
- **real HLS playback via hls.js** (a dev-only CORS proxy in the dev server
  rewrites the playlists so the whole chain works despite Twitch's CORS),
- a **virtual remote** (on-screen D-pad + keyboard) mapped to TV key codes, so
  you exercise the exact key handling the TVs use.

Keyboard map: `↑ ↓ ← →` navigate · `Enter` select · `Backspace` back ·
`R G Y B` color buttons · `PgUp`/`PgDn` quality · in the player, `←` opens the
quality panel.

Useful query overrides:

```
?lang=de                       UI language
?proxy=https://…               use a specific dev CORS proxy
?proxy=none                    no proxy; use the static-host embed fallback
```

Because the harness drives the same `core/` as the TVs, a bug you see here is a
bug on the TV — and 95% of them are findable here.

## 2. Unit tests ✅

```bash
npm test       # node --test, zero dependencies
npm run lint   # fails if any ES6 reaches the TV-targeted code
```

The tests mock `XMLHttpRequest` and run the global-namespaced core in a `vm`
sandbox — covering the m3u8 parser, the GraphQL client (shape mapping, the
`first:30` cap, error handling, usher URL building), i18n and utils.

---

## 3. Tizen TVs (2015+) 📦

Two install paths, neither needing manual cert handling:

**A. Native `.wgt` via [Apps2Samsung](install/apps2samsung.md) (2015+, AVPlay).**

```bash
npm run release         # -> dist/release/Twellie.wgt (generic-signed; Apps2Samsung re-signs per-TV)
                        #    auto-fetches the Tizen CLI into dist/.tizen-sdk/ on first run
                        #    (Rosetta 2 on Apple Silicon; pre-fetch with `npm run tizen:setup`)
```

Verify the package without a TV: `unzip -l dist/release/Twellie.wgt` should show
`config.xml`, `author-signature.xml`, `signature1.xml` and the `core/` tree. On a
real panel, install it through Apps2Samsung (it signs for your TV and pushes it).

**Tizen TV Emulator note:** if Emulator 10 shows a `7011` dialog saying
`Fast RWI is used` and starts on `about:blank`, that is the emulator's Remote Web
Inspector startup pause. It is not rendered by Twellie and is not controlled by
`config.xml`; the emulator loads `about:blank` first so DevTools can attach before
network requests start. Disable/avoid Fast RWI or launch the app normally instead
of through the debugger to skip it. Clicking **OK** simply continues into
`index.html`.

**B. TizenBrew module (2017+, hls.js).**

```bash
npm run build:tizenbrew      # -> dist/tizenbrew/{package.json, app/}
```

- **Real panel:** publish `dist/tizenbrew/` (npm or a tagged GitHub repo) and add it
  in TizenBrew by name. hls.js + MSE: reliable 2017+ / solid 2019+.
- **Boot check on a laptop (no TV):** statically serve `dist/tizenbrew/app/` and open
  `index.html` — it boots the `tizenbrew` adapter and renders the live browse grid via
  GraphQL (console logs `starting on platform "tizenbrew"`, no errors). Remote nav uses
  Tizen keyCodes, so use the harness in §1 for interaction testing.

> What only a real TV can confirm: AVPlay (`.wgt`) playback, hls.js/MSE playback in the
> TizenBrew webview, on-device remote keys, and Twitch TLS/SNI reachability. The harness
> covers everything else.

## 4. Orsay TVs (2013–2014) 🕹️

No reliable emulator on a modern Mac. On a real F/H panel (2011–2012 D/E are not
supported). Orsay has **no `12345` toggle** — you sign Smart Hub into the built-in
**`develop`** account and sync from a LAN web server. Full steps, with the F-vs-H
menu differences: [docs/install/orsay-2013-2014.md](install/orsay-2013-2014.md).

1. **Run the App-Sync server on port 80.** `npm run host:bin` builds the
   self-contained installer; `npm run host -- 80` runs it from source. It **must**
   listen on **80** — the Orsay IP field has no port box, so the TV always fetches
   on port 80 (the default 8080 silently fails).
2. **Sync from the TV** as user `develop`:
   - **F (2013):** More Apps → Options → *IP Setting* → host IP → Options → *Start App Sync*.
   - **H (2014):** hold OK ~5 s on any app → *IP Setting* → host IP → hold OK → *Start User App Sync*.
3. **Watch.** The app connects to Twitch **directly**; most F/H sets reach it
   fine. A panel whose firmware can't negotiate modern TLS isn't supported.

## 5. Which buttons to check on-device

| Generation | Verify | Most likely to need tweaks |
| --- | --- | --- |
| Tizen 2015+ | AVPlay starts, quality switch, color buttons (needs `registerKey`), Back exits | quality track labels, `ADAPTIVE_INFO` syntax per year |
| Orsay 2014 (H) | INFOLINK plays `|COMPONENT=HLS`, color buttons, Twitch reachable | screensaver via Common API |
| Orsay 2013 (F) | basic nav, INFOLINK playback, modern-TLS reach | CSS quirks |

## 6. No TV at all? 💸

A used 2015–2018 Samsung Tizen set is cheap secondhand and is the single best
device to validate the most-used path. But ship-quality confidence comes from
the harness + unit tests; the device pass is the final mile.
