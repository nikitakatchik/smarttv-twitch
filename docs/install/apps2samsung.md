# Install Twellie with Apps2Samsung (Tizen, 2015+)

[**Apps2Samsung**](https://github.com/Apps2Samsung/Apps2Samsung) is a small
cross-platform desktop tool (Windows / macOS / Linux) that sideloads any Tizen
`.wgt` onto a Samsung TV — and **handles the certificate for you**. It detects
the TV, mints a Samsung author + distributor certificate bound to *that TV's*
DUID, **re-signs** the package, and installs it. No Samsung account juggling, no
Tizen Studio, no DUID hunting on your side.

This is the easiest way to run Twellie as a real, installed native app (it uses
the TV's hardware **AVPlay** player). For a no-installer alternative see
[TizenBrew](tizenbrew.md).

## You need

- A computer with **Apps2Samsung** ([download](https://github.com/Apps2Samsung/Apps2Samsung/releases/latest)).
- Your TV in **Developer Mode** — Apps → type **1 2 3 4 5** → Developer mode On →
  enter your computer's IP → reboot.
  ([Apps2Samsung's how-to](https://github.com/Apps2Samsung/Apps2Samsung/wiki/FAQ#-how-to-enable-developer-mode-on-your-tv).)
- **`Twellie.wgt`** — grab it from the
  [latest release](https://github.com/nkatchik/smarttv-twitch/releases/latest/download/Twellie.wgt),
  or build it yourself (below).

## Install

1. Launch **Apps2Samsung** and let it find your TV (same network).
2. For the app, choose **“Custom WGT File”** and select `Twellie.wgt`.
3. Click **Install**. Apps2Samsung re-signs it for your TV and pushes it over the
   network. When it finishes, launch **Twellie** from the TV's Apps screen.

> Apps2Samsung **always re-signs** a custom (non-Jellyfin) `.wgt` with a cert it
> mints for your TV's DUID, so the generic signature Twellie ships with is
> irrelevant on the device — you never handle a certificate.

## Build the `.wgt` yourself

```bash
npm run release          # -> dist/release/Twellie.wgt  (+ the Orsay/web zips)
```

On first run, `release` auto-fetches a self-contained Tizen CLI into gitignored
`dist/.tizen-sdk/` (no system install). On Apple Silicon it needs **Rosetta 2** —
if it's missing, release prints the one-liner and just skips the `.wgt` (the zips
still build). You can pre-fetch the CLI yourself with `npm run tizen:setup`.

`release` signs the `.wgt` with a **throwaway generic** author cert + the SDK's
default distributor cert — purely to make it a valid Tizen package. It is **not**
bound to any TV; Apps2Samsung handles the real, DUID-bound signing at install
time. No Samsung account is involved on this side.

## Notes

- **Player:** the installed `.wgt` uses native **AVPlay** (privileged, declared in
  `config.xml`), which plays Twitch HLS without needing browser MSE — so it works
  on older Tizen sets (2015+) where the TizenBrew/hls.js path is shakier.
- **Internet access:** `config.xml` must carry both
  `http://tizen.org/privilege/internet` and
  `<access origin="*" subdomains="true">`. The WebView uses that access for
  Twitch browse/login/chat requests and for remote thumbnails; AVPlay then plays
  the resolved stream URL natively.
- **Updating:** re-run Apps2Samsung with a newer `Twellie.wgt`; it reuses the same
  author identity so the install overwrites cleanly.
- **CORS/TLS:** the native player sends no browser `Origin` and reaches Twitch
  directly (see [PLATFORMS.md](../PLATFORMS.md)).
