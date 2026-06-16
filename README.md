<p align="center">
  <img src="docs/media/logo.png" alt="Twellie" width="200" />
</p>

<h1 align="center">Twellie</h1>

<p align="center">
  <b>An unofficial viewer for Twitch on any Samsung Smart TV — from a 2013 Orsay set to a 2024 Tizen panel.</b> <br />
  Not affiliated with Twitch, Samsung, or Tizen.
</p>

<p align="center">
  <a href="https://github.com/nikitakatchik/smarttv-twitch/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/nikitakatchik/smarttv-twitch/ci.yml?branch=master&style=flat-square&label=ci" alt="ci"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square" alt="License: GPL v3"></a>
  <img src="https://img.shields.io/badge/platform-Samsung%20Orsay%20%2B%20Tizen-23d3a3.svg?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Made%20with-JavaScript%20(ES5)-F7DF1E.svg?style=flat-square&logo=javascript&logoColor=black" alt="Made with JavaScript">
</p>

## Features

- Live Twitch browsing: top streams, categories, category stream pages, and direct channel playback.
- Following: device-code sign-in for followed channels, live categories, live streams, and offline channel pages.
- Live chat overlay: anonymous IRC-over-WebSocket chat over the video, no login required.
- VODs and clips: each channel's past broadcasts and top clips, with playback.
- Quality switching: Auto down to 160p, selected from the real Twitch renditions.
- Remote-first navigation: D-pad grids and color-button shortcuts, with no mouse required.
- Eight languages: English, Deutsch, Русский, Español, Português, Українська, Français, Svenska.
- One ES5 core for Orsay, Tizen, TizenBrew, and the browser harness.
- No backend or proxy for browse/playback; public Twitch endpoints are used directly where possible.
- Browser harness for development: `npm start` runs the app with real Twitch playback.

## Supported TVs

| Year | Series | Platform | Player | Status |
| ---- | ------ | -------- | ------ | ------ |
| 2013–2014 | F / H | Orsay | `INFOLINK` | Direct |
| 2015–2024+ | J / K / M / N / R / T / U … | Tizen | `AVPlay` | Supported |
| any | — | Browser (dev) | hls.js | Development |

Full matrix, engines, and caveats: [docs/PLATFORMS.md](docs/PLATFORMS.md).

## Install on Your TV

Download the package for your TV from the
[**latest release**](https://github.com/nikitakatchik/smarttv-twitch/releases/latest),
then follow the guide for your model year.

| Your TV | Install | Guide |
| ------- | ------- | ----- |
| **2015 and newer** — Tizen (J · K · M · N · R · T · U …) | [Twellie.wgt](https://github.com/nikitakatchik/smarttv-twitch/releases/latest/download/Twellie.wgt) with **Apps2Samsung** (signs and installs), or **TizenBrew** | [Apps2Samsung](docs/install/apps2samsung.md) · [TizenBrew](docs/install/tizenbrew.md) |
| **2013–2014** — Orsay (F · H) | [Orsay installer](#orsay-installer) | [F / H guide](docs/install/orsay-2013-2014.md) |

> Older **2011–2012** (D / E) Orsay sets aren't supported — their MAPLE engine and
> aged TLS make them the weakest, least reliable targets.

### Orsay Installer

Orsay TVs (2013–2014) sideload apps over your Wi-Fi from a computer, so you run a
small **installer** once. It's a self-contained app that bundles a **signed,
unmodified copy of Node** — nothing to install, and no security warning to click
through. It detects your computer's IP and pushes Twellie onto the TV; once it's
installed you **close the installer** and the TV streams Twitch directly.
(Tizen TVs use [Apps2Samsung](docs/install/apps2samsung.md) or
[TizenBrew](docs/install/tizenbrew.md) instead and need none of this.)

> Most F/H sets reach Twitch directly. Very old firmware whose TLS can't is not
> supported. See the [guide](docs/install/orsay-2013-2014.md).

Grab the one for your computer — each always points at the newest release:

| Your computer | Download |
| ------------- | -------- |
| **macOS** (Apple Silicon · M1–M4) | [twellie-orsay-host-macos-arm64.zip](https://github.com/nikitakatchik/smarttv-twitch/releases/latest/download/twellie-orsay-host-macos-arm64.zip) |
| **macOS** (Intel) | [twellie-orsay-host-macos-x64.zip](https://github.com/nikitakatchik/smarttv-twitch/releases/latest/download/twellie-orsay-host-macos-x64.zip) |
| **Windows** (64-bit) | [twellie-orsay-host-windows-x64.zip](https://github.com/nikitakatchik/smarttv-twitch/releases/latest/download/twellie-orsay-host-windows-x64.zip) |

## Credits and Heritage

Born in 2014 and shaped by a decade of community pull requests — translations, compatibility fixes and tweaks from the contributors.

## Contributing

PRs welcome.

1. Fork the repo.
2. `git checkout -b my-feature`
3. Keep the TV code **ES5** — run `npm run lint` and `npm test`
4. Verify in the harness (`npm start`)
5. Open a PR
