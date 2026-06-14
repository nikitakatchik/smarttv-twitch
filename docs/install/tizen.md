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
- [**Download `twellie-tizen.zip`**](https://github.com/nikitakatchik/smarttv-twitch/releases/latest/download/twellie-tizen.zip) — always points to the latest release.

## Step 1 — Install the toolchain (once)

1. Install VS Code, then the **“Tizen TV”** extension.
2. Run the extension's **“Install Tizen Baseline SDK”** command (Command Palette
   → `Ctrl/Cmd+Shift+P` → type *Tizen*). This pulls in the `tizen` + `sdb` CLI,
   Certificate Manager and Device Manager. You'll also need a **JDK** (8 or 12+).
3. Create a **Samsung certificate** — Command Palette → **`Tizen TV: Run
   Certificate Manager`** → create a **Samsung** *author* + *distributor*
   certificate (sign in with your Samsung account). It must be the **Samsung**
   type, not a generic Tizen certificate, or the TV will refuse to install it.

> The distributor certificate whitelists each TV's **DUID** (up to 50 devices).
> The easiest path is to connect the TV first (Step 3) and let Certificate
> Manager capture its DUID automatically; if you swap TVs later, re-add the new
> DUID and re-sign.

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

The CLI lives in the SDK the extension installed (`<tizen-sdk>/tools/ide/bin`).
From a terminal in the unzipped `twellie-tizen` folder:

```bash
tizen build-web   -- .                               # build the web app
tizen package -t wgt -s <your-cert-profile> -- .buildResult
sdb connect <TV-IP>                                  # Tizen TVs use port 26101
sdb devices                                          # note the device/target name (right column)
tizen install -n Twellie.wgt -t <device-name>        # -t takes the target NAME, not the IP
```

> **Prefer buttons?** The extension does all of this in two commands:
> **`Tizen TV: Build Signed Package`**, then **`Tizen TV: Launch Application`**
> (it packages, installs and starts the app on the connected TV).

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
