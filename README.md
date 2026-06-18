<p align="center">
  <img src="docs/media/logo.png" alt="Twellie" width="200" />
</p>

<h1 align="center">Twellie</h1>

<p align="center">
  <b>An unofficial viewer for Twitch on any Samsung Smart TV — from a 2013 Orsay set to a modern Tizen panel.</b> <br />
  Not affiliated with Twitch, Samsung, or Tizen.
</p>

<p align="center">
  <a href="/nkatchik/smarttv-twitch/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/nkatchik/smarttv-twitch/ci.yml?branch=master&style=flat-square&label=ci" alt="ci"></a>
  <a href="https://nkatchik.github.io/smarttv-twitch/"><img src="https://img.shields.io/badge/demo-GitHub%20Pages-2ea44f.svg?style=flat-square" alt="Live demo"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square" alt="License: GPL v3"></a>
  <img src="https://img.shields.io/badge/platform-Samsung%20Orsay%20%2B%20Tizen-23d3a3.svg?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Made%20with-JavaScript%20(ES5)-F7DF1E.svg?style=flat-square&logo=javascript&logoColor=black" alt="Made with JavaScript">
</p>

## Features

- 📺 **Browse Twitch** - live streams, categories, channel pages, and direct playback.
- 👥 **Following** - device-code sign-in, live follows, live categories, and offline pages.
- 💬 **Live chat** - anonymous IRC-over-WebSocket chat over the video.
- 🎞️ **VODs and clips** - past broadcasts and top clips from each channel.
- 🎚️ **Quality control** - real Twitch renditions from Auto down to 160p.
- 🎮 **Remote first** - D-pad grids and color-button shortcuts, no mouse required.
- 🧩 **Wide TV support** - one ES5 core for Orsay, Tizen, TizenBrew, and browser.
- 🔌 **No backend required** - TV builds talk to public Twitch endpoints directly.
- 🌍 **8 languages** - localized UI for the supported app builds.

## Supported TVs

| Year | Series | Platform | Player | Status |
| ---- | ------ | -------- | ------ | ------ |
| 2015+ | J and newer Tizen model years | Tizen | `AVPlay` | 🟢 Supported |
| 2013–2014 | F / H | Orsay | `INFOLINK` | 🟡 Limited |

Full matrix, engines, and caveats: [docs/PLATFORMS.md](docs/PLATFORMS.md).

## Install on Your TV

Pick the one guide that matches your TV and computer. Each guide is written
end-to-end with one Twellie package.

| | | |
| - | - | - |
| **2013 F-series** | Orsay | [📦 macOS](docs/install/orsay-f-2013-macos.md) · [📦 Windows](docs/install/orsay-f-2013-windows.md) |
| **2014 H-series** | Orsay | [📦 macOS](docs/install/orsay-h-2014-macos.md) · [📦 Windows](docs/install/orsay-h-2014-windows.md) |
| **2015+** | Tizen | [📦 Apps2Samsung](docs/install/apps2samsung.md) |
| **2017+** | Tizen | [📦 TizenBrew](docs/install/tizenbrew.md) |

Older **2011-2012** **D**/**E** Orsay sets are not supported.

## Credits and Heritage

Born in 2014 and shaped by a decade of community pull requests — translations, compatibility fixes and tweaks from the contributors.

## Contributing

PRs welcome.

1. Fork the repo.
2. `git checkout -b my-feature`
3. Keep the TV code **ES5** — run `npm run lint` and `npm test`
4. Verify in the harness (`npm start`)
5. Open a PR
