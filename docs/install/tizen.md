# Install Twellie on a Tizen TV (2015 and newer)

For Samsung Smart TVs from **2015 onward** — model years J, K, M, N, R, T, U…
(the 5th character of the model number is the year letter, e.g. `UN55`**`J`**`6300`).

> Twellie is an **unofficial** viewer for Twitch. Not affiliated with Twitch,
> Samsung, or Tizen.

Tizen TVs play Twitch **directly** — no installer or helper needed. You sideload
the app as a signed `.wgt` over your network. There's nothing to buy and no
account fee.

## You need

- A computer (any OS) with **[Visual Studio Code](https://code.visualstudio.com/)**
  and the **Tizen** extension (search the Extensions panel for *“Tizen TV”*,
  publisher **Samsung**). Its commands are prefixed **`Tizen TV:`**.
  - Samsung **retired standalone Tizen Studio** — its final release was 6.1
    (April 2025) and maintenance ended at the close of 2025. The VS Code
    extension (Tizen SDK 10) is the official successor and ships the same
    toolchain: the `tizen` / `sdb` CLI, **Certificate Manager**, Device Manager
    and the emulator. (If you still have a working Tizen Studio install, the CLI
    steps below are identical.)
- A free **Samsung account** (for the signing certificate).
- Your TV's IP address (Settings → General → Network → Network Status).
- [**Download `twellie-tizen-unsigned.zip`**](https://github.com/nikitakatchik/smarttv-twitch/releases/latest/download/twellie-tizen-unsigned.zip) — the Tizen web app, ready to sign (always the latest release). It isn't a finished `.wgt`: a Tizen package must be signed with **your own** Samsung certificate, bound to your TV's DUID, so you sign it below.

## Step 1 — Install the toolchain (once)

You don't need VS Code or the Certificate Manager GUI. From the repo:

1. `npm run tizen:setup` — fetches a self-contained Tizen CLI into gitignored
   `dist/.tizen-sdk/` (no system-wide install; on Apple Silicon it needs Rosetta 2
   and tells you if it's missing). This bundles the `tizen` + `sdb` CLI and a JDK.
2. `npm run cert -- --duid <TV-DUID>` — mints a **Samsung** *author* +
   DUID-bound *distributor* certificate and registers the signing profile,
   **headlessly**. The only interactive step is a single Samsung-account login
   that opens in your browser (Samsung's CA issues certs only against an account
   token — there is no password/API grant). Certs land in `~/Documents/Dev/SamsungTV`.
   - Find the **DUID** on the TV at **Menu → Support → Contact Samsung** (*Unique
     Device ID*), or just connect a dev-mode TV (Step 2) and `npm run cert` reads
     it over `sdb` automatically. Pass several comma-separated for multiple TVs.
   - It **must** be the Samsung VD type bound to your DUID — the SDK's generic
     Tizen distributor cert is rejected by retail TVs (`install failed [118, -12]`).
   - Prefer no listener at all? `npm run cert -- --duid <DUID> --paste` prints the
     login URL and asks you to paste back the redirect; or set
     `SAMSUNG_ACCESS_TOKEN`/`SAMSUNG_USER_ID` for a fully non-interactive run.

> The distributor certificate whitelists each TV's **DUID** and expires (Samsung
> VD certs last ~2 years). When it lapses, re-run `npm run cert` and re-install —
> the app stops launching once the signing cert is no longer valid.

> **Prefer the GUI?** You still can: install VS Code + the **“Tizen TV”**
> extension and run **`Tizen TV: Run Certificate Manager`** to create the same
> Samsung author + distributor certificate by hand. The CLI flow above just
> automates it.

## Step 2 — Enable Developer Mode on the TV

1. Press **Home**, open the **Apps** panel (the Samsung app store screen — the
   code only registers from here, **not** the main Settings menu).
   - **2024+ models (One UI / Tizen 7–9):** scroll to the bottom of the Apps tab
     and open **App Settings** (it may read just *Settings*) **first**.
2. On the remote, type **1 2 3 4 5** (the code is the same on every model year,
   2015–today). A *Developer mode* popup appears.
3. Switch **Developer mode** to **On**, enter your **computer's IP** in the
   *Host PC IP* field, and confirm. (If the field shows a `0.0.0.0` placeholder,
   just type the four octets over it.)
4. **Reboot the TV** (required). After it restarts, re-open the Apps panel — a
   **Develop** banner at the top confirms it's active.

## Step 3 — Package, sign and install

**From the repo (recommended):** one command builds, signs and is ready to
install. `npm run release` produces a signed `dist/release/Twellie.wgt` using the
profile from Step 1. Then connect and install:

```bash
sdb connect <TV-IP>                                  # Tizen TVs use port 26101
sdb devices                                          # note the device/target name (right column)
tizen install -n dist/release/Twellie.wgt -t <device-name>   # -t = target NAME, not the IP
```

(`npm run release-unsigned` instead produces the raw, unsigned bundle if you want
to sign it some other way. The `tizen`/`sdb` CLIs are the ones `npm run
tizen:setup` placed in `dist/.tizen-sdk/`.)

**By hand**, from a terminal in an unzipped `twellie-tizen-unsigned` folder:

```bash
tizen build-web   -- .                               # build the web app
tizen package -t wgt -s <your-cert-profile> -- .buildResult
sdb connect <TV-IP>
tizen install -n Twellie.wgt -t <device-name>
```

> **Prefer buttons?** If you installed the **“Tizen TV”** VS Code extension, it
> does all of this in two commands: **`Tizen TV: Build Signed Package`**, then
> **`Tizen TV: Launch Application`**.

Then **launch Twellie** from the Apps screen.

## Troubleshooting

- **`tizen install` says "install failed"** — this is a known false negative.
  Check the lines just *above* the final message for a success line, and check
  the TV's app list before retrying.
- **`-t` vs `-s`** — `-t/--target` takes the **target name** (the right column of
  `sdb devices`, e.g. a model name). If you'd rather use the `IP:port`, that's
  the **`-s/--serial`** flag (the left column, e.g. `192.168.0.50:26101`).
- **USB `.wgt` won't install** — Samsung disables USB `.wgt` install on modern
  firmware for security; use `sdb` over the network as above.
- **Can't connect with `sdb`** — confirm Developer Mode is **On**, the *Host PC
  IP* on the TV matches your computer, both are on the same subnet, and no
  firewall blocks port **26101**. A reboot after first enabling Dev Mode helps.
- **Developer Mode keeps turning off** — a major firmware update can reset it (a
  Samsung security measure). Just re-enable it. On 2024+ One UI it also *moved* —
  it's behind **App Settings** at the bottom of the Apps tab now.
- **A "Commercial break" plays first** — anonymous playback gets Twitch's
  pre-roll ad; it clears to the live stream after a few seconds.

> **No TV to test on?** The Tizen **emulator needs Intel HAXM and won't run on an
> Apple-Silicon Mac** (the CLI works under Rosetta, the emulator doesn't). Use
> the browser harness (`npm start`) for everything except the final on-device
> pass — see [docs/TESTING.md](../TESTING.md).
