# Install Twellie via TizenBrew (no signing, any 2017+ Tizen TV)

This is the **easiest** way to run Twellie on a modern Samsung TV — and the only
one that lets people install it from a public link **without signing a package
for each TV**.

> Why this exists: a sideloaded `.wgt` must be signed with a Samsung distributor
> certificate bound to *that specific TV's* DUID (see
> [tizen.md](tizen.md)). So you can't hand out one pre-signed file. **TizenBrew**
> sidesteps that: you sideload the TizenBrew *loader* once (signed for your TV),
> and it then runs web "modules" — like Twellie — pulled straight off the network,
> with no per-app signing.

## How it works

TizenBrew is a host app. When you add a module, it fetches the module's
`package.json` from jsDelivr, registers the remote keys it asks for, and navigates
its webview to the module's page (served through TizenBrew's local proxy off
jsDelivr). Twellie ships as an **app module**: the same Twitch app as the other
builds, playing video through HTML5 `<video>` + hls.js (TizenBrew doesn't expose
the privileged AVPlay API to modules, so Twellie uses the browser media path).

## Install (end user)

1. **Install TizenBrew** on the TV (sideload its `.wgt` in Developer Mode — see
   the [TizenBrew releases](https://github.com/reisxd/TizenBrew/releases) and its
   README). Launch it.
2. In TizenBrew's module manager, **add the module** by its reference:
   - npm: **`twellie-tizenbrew`** (TizenBrew resolves it as `npm/twellie-tizenbrew`), or
   - GitHub: **`gh/nikitakatchik/<repo>@<tag>`** if hosted there instead.
3. TizenBrew lists **Twellie** — select it. It registers the remote keys, then
   opens the app.
4. **Remote:** arrows + OK navigate, **Back** returns to the TizenBrew menu, the
   **colour buttons** switch browse tabs (A Channels · B Games · C Followed · D
   Open), **CH ▲/▼** change quality in the player — same bindings as every Twellie
   build.

No certificate, no Samsung account, no Tizen Studio, no `.wgt` — TizenBrew is the
signed host; Twellie is just a package it pulls over the network.

## Publish (maintainer)

`npm run build:tizenbrew` emits the module to `dist/tizenbrew/`:

```
dist/tizenbrew/
  package.json        # the TizenBrew manifest (packageType: app, appPath, keys)
  app/                # the runnable app (index.html + core/ ui/ lang/ assets/ platform/)
```

Publish it so jsDelivr can serve it, either:
- **npm:** `cd dist/tizenbrew && npm publish` → resolvable as `npm/twellie-tizenbrew`, or
- **GitHub:** commit `dist/tizenbrew/`'s contents to a repo and tag it →
  `gh/<user>/<repo>@<tag>`.

`appPath` is package-root-relative (`app/index.html`), so it concatenates
correctly into both TizenBrew's `127.0.0.1:8081/module/<mod>/…` proxy URL and the
transitive jsDelivr URL.

## Caveats (only a real TV confirms these)

- **Playback** rides on hls.js + MSE in the TizenBrew webview (no AVPlay). MSE is
  reliable on **2017+** Chromium-based Tizen sets and solid from **2019+ (Tizen
  5.0)**; 2016 and earlier may struggle.
- Twitch low-latency / ad-insertion discontinuities can stall on older webviews;
  `lowLatencyMode` is on and may need disabling on old models.
- The client-side GraphQL playback-token → `usher.m3u8` flow must complete from the
  webview, and Twitch hosts must be TLS/SNI-reachable from the TV — re-verify on
  hardware; a tiny token proxy is a fallback only if Twitch blocks the TV origin.
- Remote keys beyond the colour buttons depend on the model's
  `getSupportedKeys()`; Twellie registers defensively so an unsupported name is
  skipped, not fatal.
