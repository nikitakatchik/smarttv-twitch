# Logging in (followed channels)

Twellie works fully **without** an account — browse, search, watch live, VODs and
clips, and chat are all anonymous. Logging in adds:

- **Followed channels** — a *Followed* tab showing the channels you follow that
  are live right now.

(Sub-only playback is **not** available from a third-party client — see the
caveat at the bottom.)

Login uses Twitch's **Device Code flow**: the TV shows a short code, you approve
it on your phone, and no password is ever typed on the TV or stored. There is no
backend and no secret.

## Log in on the TV

1. In Twellie, move up to the **● Log in** chip in the top bar and press OK
   (or open the **Followed** tab).
2. The TV shows a code and a URL. On your phone or computer, open
   **<https://www.twitch.tv/activate>**, sign in, and enter the code (the URL the
   TV shows already includes it).
3. Approve the requested permission (`user:read:follows`). Twellie picks up the
   login automatically and drops you on the **Followed** tab.

That's it — there's nothing to type on the TV. Twellie ships with a registered
public Twitch app, so the code appears as soon as you open the login screen.

To **log out**, open the account chip again and choose **Log out** (this also
revokes the token with Twitch).

## What's stored, and where

Only the resulting access/refresh tokens and your user id/name are saved, in the
device's local storage (`localStorage`, namespaced `tw.`). Nothing is sent
anywhere except Twitch's own `id.twitch.tv` / `api.twitch.tv`. Logging out clears
it and revokes the token.

## Advanced: use your own Client ID

Twellie's bundled Client ID (`config.api.userClientId`) is fine for everyone — a
Client ID is a public identifier, not a secret. You only need your own if you're
rebuilding Twellie under your own Twitch app, or the bundled one ever gets
rate-limited. To register one:

1. Go to **<https://dev.twitch.tv/console/apps>** and sign in.
2. Click **Register Your Application** and fill in:
   - **Name:** anything unique across Twitch, e.g. `Twellie on my TV`.
   - **OAuth Redirect URLs:** `http://localhost` — the device flow doesn't use
     it, but the field is required.
   - **Category:** *Application Integration* (or *Other*).
   - **Client Type:** **Public** ← the device flow is for public clients, which
     have **no secret**.
3. Click **Create**, then **Manage**, and copy the **Client ID** (~30 chars). You
   do **not** need the client secret.

Then set it in [`src/core/config.js`](../src/core/config.js) (`api.userClientId`)
and rebuild. There is no on-TV entry for a Client ID — it's a build-time value,
not something a viewer types on the couch. For local development the browser
harness lets you override it without editing config, via a query parameter:

```
http://localhost:8080/?clientId=<your-client-id>
```

## Caveat: sub-only content

Followed channels work through Twitch's documented **Helix** API and are
reliable. **Sub-only playback is not supported.** Playback runs on Twitch's
public GraphQL endpoint, which authorizes only the anonymous web Client-ID;
attaching a user token minted by a third-party (device-flow) app gets the request
rejected (`401`) — and doing so broke *all* browsing, not just sub-only — so
Twellie never sends it. There is no fully-supported public path for sub-only
playback from a third-party client, so a sub-only stream simply won't start. That
isn't a bug in the app.
