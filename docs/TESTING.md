# 🧪 Testing without a Samsung TV

You almost never need a physical TV. Here's the honest, current (2026) picture
for each generation — including the macOS-on-Apple-Silicon gotchas.

## TL;DR

| What | How | Needs a TV? |
| --- | --- | --- |
| All app logic + UI + **live playback** | `npm start` → browser harness | ❌ |
| Core logic (parser, API, i18n) | `npm test` | ❌ |
| ES5 / old-engine safety | `npm run lint` | ❌ |
| Final Tizen validation | real TV in Developer Mode + `sdb` | ✅ |
| Final Orsay validation | real TV (develop account / USB) | ✅ |

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
- **real HLS playback via hls.js** (the dev server's relay rewrites the
  playlists so the whole chain works despite Twitch's CORS),
- a **virtual remote** (on-screen D-pad + keyboard) mapped to TV key codes, so
  you exercise the exact key handling the TVs use.

Keyboard map: `↑ ↓ ← →` navigate · `Enter` select · `Backspace` back ·
`R G Y B` color buttons · `PgUp`/`PgDn` quality · in the player, `←` opens the
quality panel.

Useful query overrides:

```
?lang=de                       UI language
?backend=proxy&proxy=https://… test the official Helix path
?relay=https://…workers.dev    test your deployed relay
?relay=none                    attempt direct (playback usually CORS-blocked)
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

No emulator on Apple Silicon — test on a real panel. The toolchain (Tizen Studio
CLI) *does* install on macOS (via Rosetta) and deploys over the network.

```bash
# Build the package layout, then sign + package as a .wgt
npm run build:tizen                 # -> dist/tizen/
# (in Tizen Studio CLI, with an author+distributor cert profile 'myprofile')
tizen build-web -- dist/tizen
tizen package -t wgt -s myprofile -- dist/tizen/.buildResult

# On the TV: Apps → type 1 2 3 4 5 → Developer Mode ON → enter your Mac's IP → reboot
sdb connect <TV-IP>
sdb devices                          # note the device name
tizen install -n Twitch.wgt -t <device-name>
#   ("install failed" is a known false-negative — check the TV)
```

You'll need a free Samsung account to create the certificate in **Certificate
Manager** (author + distributor cert tied to the TV's DUID).

> Samsung's **Web Simulator** runs on macOS but **does not support HLS/DRM** and
> stubs the TV APIs — fine for a static layout glance, useless for the player.
> Use the harness instead.

## 4. Orsay / pre-Tizen TVs (2011–2014) 🕹️

No reliable emulator on a modern Mac. On a real legacy panel:

1. **Deploy the relay first** ([proxy/](../proxy/)) and set `relayBase` in
   `src/platforms/orsay/boot.js` — pre-2017 TVs can't reach Twitch's TLS/SNI
   endpoints without it.
2. `npm run build:orsay` → `dist/orsay/`, then install via either:
   - **USB**: format a USB stick FAT32, create a root folder `userwidget`, drop
     the packaged widget inside, insert into the TV → it imports into Smart Hub.
     (Most reliable across model years.)
   - **Develop account / IP App Sync**: log into Smart Hub as user `develop`,
     point its server IP at a PC serving the widget, then *Start App Sync*.

Menu paths vary by firmware (Internet@TV on 2011–2012, Smart Hub on 2013–2014).

## 5. Which buttons to check on-device

| Generation | Verify | Most likely to need tweaks |
| --- | --- | --- |
| Tizen 2015+ | AVPlay starts, quality switch, color buttons (needs `registerKey`), Back exits | quality track labels, `ADAPTIVE_INFO` syntax per year |
| Orsay 2014 (H) | INFOLINK plays `|COMPONENT=HLS`, color buttons, relay reachable | screensaver via Common API |
| Orsay 2011 (D) | JSON polyfill loads, relay reachable, basic nav | MAPLE CSS quirks, on-screen IME |

## 6. No TV at all? 💸

A used 2015–2018 Samsung Tizen set is cheap secondhand and is the single best
device to validate the most-used path. But ship-quality confidence comes from
the harness + unit tests; the device pass is the final mile.
