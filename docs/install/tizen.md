# Install Twellie on a Tizen TV (2015 and newer)

For Samsung Smart TVs from **2015 onward** — model years J, K, M, N, R, T, U…
(the 5th character of the model number is the year letter, e.g. `UN55`**`J`**`6300`).

> Twellie is an **unofficial** viewer for Twitch. Not affiliated with Twitch,
> Samsung, or Tizen.

Tizen TVs play Twitch **directly** — no installer or helper needed. You sideload
the app as a signed `.wgt` using Samsung's free Tizen Studio.

## You need

- A computer (any OS) with [Tizen Studio](https://developer.samsung.com/smarttv/develop/tools/tv-extension/download.html) + the TV extension.
- A free Samsung account (for the signing certificate).
- Your TV's IP address (Settings → General → Network → Network Status).
- [**Download `twellie-tizen.zip`**](https://github.com/nikitakatchik/smarttv-twitch/releases/latest/download/twellie-tizen.zip) — always points to the latest release.

## Steps

1. **Unzip** `twellie-tizen.zip`.
2. **Create a certificate.** In Tizen Studio open **Certificate Manager** and
   create a Samsung **author + distributor** certificate (it ties to your Samsung
   account and the TV's DUID). Name the profile e.g. `twellie`.
3. **Enable Developer Mode on the TV.** Open **Apps**, type **1 2 3 4 5** on the
   remote, switch **Developer mode** On, enter your **computer's IP**, and reboot
   the TV.
4. **Package and install** from a terminal (Tizen Studio CLI is in
   `<tizen-studio>/tools/ide/bin`):
   ```bash
   tizen build-web   -- ./twellie-tizen            # the unzipped folder
   tizen package -t wgt -s twellie -- ./twellie-tizen/.buildResult
   sdb connect <TV-IP>
   sdb devices                                     # note the device name
   tizen install -n Twellie.wgt -t <device-name>
   ```
5. **Launch Twellie** from the Apps screen.

## Troubleshooting

- **`tizen install` says "install failed"** — this is a known false negative;
  check the TV's app list before retrying.
- **USB `.wgt` won't install** — modern Tizen firmware disables USB `.wgt`
  install for security; use `sdb` over the network as above.
- **A "Commercial break" plays first** — anonymous playback gets Twitch's
  pre-roll ad; it clears to the live stream after a few seconds.
- **Can't connect with `sdb`** — make sure the TV's Developer Mode host IP is
  your computer's IP, you're on the same network, and no firewall blocks the
  `sdb` port.
