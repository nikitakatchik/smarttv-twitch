# Twitch relay / Helix proxy

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) (free tier is
plenty) that gives the app two things:

| Endpoint | Auth needed | What it does |
| --- | --- | --- |
| `GET/POST /relay?url=<target>` | none | Forwards a Twitch request from a real server — **no browser `Origin` header, modern TLS/SNI** — and rewrites HLS playlists so nested fetches stay on the relay. |
| `GET /helix/<path>` | client secret | The official, ToS-compliant browse path. Holds the secret, runs `client_credentials`, caches the ~60-day app token, injects `Client-Id` + `Bearer`. |

## Why you need it

- **Old TVs (2011–2016).** Samsung panels only gained SNI on 2017 models, and
  Twitch is HTTPS/SNI-only — so a pre-2017 TV literally cannot open a TLS
  connection to `gql.twitch.tv` / `usher.ttvnw.net`. Routing through `/relay`
  terminates modern TLS for them.
- **Browsers.** Twitch's usher / `*.playlist.ttvnw.net` hosts don't send
  `Access-Control-Allow-Origin` for arbitrary origins, so in-browser playback
  is CORS-blocked without the relay.
- **Official API.** If you'd rather use Helix than the unofficial GraphQL,
  `/helix/*` keeps your client secret server-side where it belongs.

Native players on Tizen (AVPlay) send no browser `Origin` and speak modern TLS,
so **Tizen TVs need none of this** — they talk to Twitch directly.

## Deploy

```bash
npm i -g wrangler
cd proxy
wrangler deploy
# Only if you want the official /helix/* path:
wrangler secret put TWITCH_CLIENT_ID
wrangler secret put TWITCH_CLIENT_SECRET
```

You'll get a URL like `https://smarttv-twitch-relay.<you>.workers.dev`.

## Point the app at it

- **Orsay / old TVs** — set `relayBase` in `src/platforms/orsay/boot.js`:
  ```js
  config: { api: { relayBase: 'https://smarttv-twitch-relay.you.workers.dev' } }
  ```
- **Official Helix browse** — set `backend: 'proxy'` and `proxyBase` to the same
  URL.
- **Harness** — `http://localhost:8080/?relay=https://...workers.dev` or
  `?proxy=https://...workers.dev`.

> Prefer a different host? The worker is ~150 lines of standard JS; it ports to
> Vercel/Netlify/Deno/Lambda with only the handler signature changed. The same
> logic runs locally in `tools/dev-server.js`.
