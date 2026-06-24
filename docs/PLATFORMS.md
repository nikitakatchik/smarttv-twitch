# Platform compatibility

Twellie targets supported Samsung Smart TV platforms where the install path,
JavaScript engine, player API, and network stack can handle the current app. This
page is a compatibility guide, not a guarantee that every TV in a model year or
region works.

Community test reports are useful. Please include the TV model, model year if
known, platform, firmware/software version, install method, what works, and what
fails.

## Compatibility buckets

| Bucket | Platforms | Notes |
| --- | --- | --- |
| Confirmed/tested | Orsay 2013 F-series and 2014 H-series App Sync flows; generated Tizen `.wgt`; generated TizenBrew module; browser harness | Orsay is anonymous-only. Tizen device coverage still depends on TV firmware, developer-mode access, and install tooling. |
| Likely but untested | Many 2015+ Tizen TVs through Apps2Samsung; many 2017+ Tizen TVs through TizenBrew | Expected from the platform APIs, but model and firmware reports are still needed. |
| Unsupported | 2011-2012 D/E Orsay; TVs that cannot negotiate modern HTTPS/TLS to Twitch endpoints; devices without developer-mode or sideload-style installation | Twellie does not bypass platform security, authentication, subscriptions, geoblocks, or other access controls. |
| Unknown | Regional firmware variants, newer platform changes, non-Samsung TV browsers, and undocumented TizenBrew configurations | Try the browser harness first, then report device results if you test on hardware. |

## Platform matrix

| Year | Series | Platform | Player | Install / run path | Current status |
| --- | --- | --- | --- | --- | --- |
| 2013 | F | Orsay | `INFOLINK` / SEF | App Sync installer | Best-effort, anonymous-only |
| 2014 | H | Orsay | `INFOLINK` | App Sync installer | Best-effort, anonymous-only |
| 2015-2016 | J/K | Tizen 2.3-2.4 | AVPlay (`.wgt`) | Apps2Samsung | Supported path, reports welcome |
| 2017 | M | Tizen 3.0 | AVPlay (`.wgt`) or hls.js | Apps2Samsung; TizenBrew where available | Supported path, reports welcome |
| 2018 | N | Tizen 4.0 | AVPlay (`.wgt`) or hls.js | Apps2Samsung; TizenBrew where available | Likely, reports welcome |
| 2019-2022 | R/T/A/B | Tizen 5-6.5 | AVPlay (`.wgt`) or hls.js | Apps2Samsung; TizenBrew where available | Likely, reports welcome |
| 2023+ | C/D/F/H and newer | Tizen 7+ | AVPlay (`.wgt`) or hls.js | Apps2Samsung; TizenBrew where available | Unknown to likely, reports welcome |
| any desktop | - | Hosted web preview | Twitch embed and `<video>` | GitHub Pages | Demo/preview |
| any desktop | - | Browser harness | hls.js | `npm start` dev server | Development and test harness |

Older 2011-2012 D/E Orsay sets are not supported. Their engines and TLS stacks
are too old for the current app and modern Twitch endpoints.

## Reaching Twitch

Modern Twitch playback and browse endpoints require current HTTPS/TLS behavior.
The app does not include a production backend service, proxy, or access-control
bypass. Each TV build either connects directly from the app/runtime or delegates
media loading to the platform player.

On Orsay, the app connects directly and stays anonymous-only. Login and followed
channels are hidden because those authenticated paths are too fragile on the old
WebKit runtime. A TV whose firmware cannot negotiate current TLS to the required
hosts is unsupported.

On Tizen, the primary install path is **Apps2Samsung** with `Twellie.wgt`.
Apps2Samsung re-signs the package for the target TV before install. Playback goes
through AVPlay; browse, chat, login, and thumbnails still run in the web runtime.
The package declares the `internet` privilege and broad widget access because
thumbnail, API, and selected media hosts are dynamic.

The TizenBrew build target is separate. TizenBrew loads Twellie as a module and
uses hls.js for playback. It is most realistic on 2017+ TVs with Media Source
Extensions support; older 2015-2016 sets are best-effort at most.

The hosted web preview is not the same as a TV install. GitHub Pages cannot run
the dev CORS proxy, so the preview uses an embedded player path for live/VOD
playback and direct clip video URLs where available. The local browser harness
(`npm start`) uses a dev-only proxy for HLS testing. That proxy is not shipped in
TV builds.

## Engine constraints

The 2013-2014 Orsay sets run old WebKit builds with no ES6. TV-targeted code is
plain ES5 and ships [`core/polyfill.js`](../src/core/polyfill.js) for small
runtime gaps. `npm run lint` fails if unsupported JavaScript syntax reaches the
TV-targeted trees.

## What each adapter supplies

A platform adapter is the only TV-specific surface (`src/platforms/<name>/`):

- **player** - `load / stop / setDisplayArea / getQualities / selectQuality`
- **keys** - native keyCode to canonical key (`UP`, `RED`, `ENTER`, ...)
- **system** - screensaver, volume, exit

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.
