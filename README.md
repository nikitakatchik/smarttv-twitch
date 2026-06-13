<h1 align="center">📺 Twellie</h1>

<p align="center">
  <b>An unofficial viewer for Twitch on any Samsung Smart TV — from a 2011 Orsay set to a 2024 Tizen panel.</b> <br />
  Not affiliated with Twitch, Samsung, or Tizen.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square" alt="License: GPL v3"></a>
  <img src="https://img.shields.io/badge/platform-Samsung%20Orsay%20%2B%20Tizen-23d3a3.svg?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Made%20with-JavaScript%20(ES5)-F7DF1E.svg?style=flat-square&logo=javascript&logoColor=black" alt="Made with JavaScript">
</p>

## ✨ Features

- 🔴 **Live Twitch** — top streams, top games, browse-by-game, open any channel.
- 🎚️ **Quality switching** — Auto down to 160p, picked from the real renditions.
- 🧭 **Made for a remote** — D-pad grid, color buttons, the works. No mouse.
- 🌍 **8 languages** — English, Deutsch, Русский, Español, Português, Українська, Français, Svenska.
- 🧩 **One core, three targets** — Orsay (2011–2014), Tizen (2015+), and a browser harness.
- 🪶 **Zero runtime dependencies** — hand-written ES5 that runs on a 2011 WebKit *and* a 2024 Chromium WebView.
- 💻 **Test without a TV** — `npm start` plays real Twitch on your laptop.

## 📺 Supported TVs

| Year | Series | Platform | Player | Status |
| ---- | ------ | -------- | ------ | ------ |
| 2011–2014 | D / E / F / H | Orsay / Maple | `INFOLINK` | ✅ *via [relay](proxy/)* |
| 2015–2024+ | J / K / M / N / R / T / U … | Tizen | `AVPlay` | ✅ |
| any | — | Browser (dev) | hls.js | 🧪 |

Full matrix, engines and caveats → **[docs/PLATFORMS.md](docs/PLATFORMS.md)**.

## 📦 Install on your TV

### Tizen (2015 and newer) — `.wgt`

```bash
npm run build:tizen                       # → dist/tizen/
# then, with Tizen Studio CLI + a signing profile:
tizen build-web   -- dist/tizen
tizen package -t wgt -s <profile> -- dist/tizen/.buildResult
# TV → Apps → 1 2 3 4 5 → Developer Mode ON → enter your PC's IP → reboot
sdb connect <TV-IP> && tizen install -n Twellie.wgt -t <device>
```

### Orsay (2011–2014) — legacy widget

1. Deploy the [relay](proxy/) and set `relayBase` in `src/platforms/orsay/boot.js`
   (these TVs can't reach Twitch over modern TLS without it).
2. `npm run build:orsay` → zip `dist/orsay/`.
3. Install via **USB** (a FAT32 stick with a root `userwidget` folder) **or** the
   **`develop` account** Smart Hub "App Sync" over your LAN.

Step-by-step for both → **[docs/TESTING.md](docs/TESTING.md)**.


## 🗺️ Roadmap

- [x] Survive the Kraken apocalypse (migrate off the dead v5 API)
- [x] Tizen (2015+) target
- [x] Browser dev-harness with real playback
- [x] Pluggable GraphQL / Helix backends + serverless relay
- [ ] 💬 Live chat overlay (revive the long-abandoned IRC experiment)
- [ ] 🔐 Logged-in mode (followed channels, sub-only streams)
- [ ] 📼 VODs & clips
- [ ] 🧰 One-command Tizen `.wgt` signing helper

## 🙌 Credits & heritage

Born in 2014 and shaped by a decade of community pull requests — translations, compatibility fixes and tweaks from the contributors.

## 🤝 Contributing

PRs welcome! 🎉

1. Fork it 🍴
2. `git checkout -b my-feature`
3. Keep the TV code **ES5** — run `npm run lint` and `npm test`
4. Verify in the harness (`npm start`)
5. Open a PR
