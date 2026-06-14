# Logging in (followed channels)

Twellie works fully **without** an account — browse, search, watch live, VODs and
clips, and chat are all anonymous. Logging in adds:

- **Followed channels** — a *Followed* tab showing the channels you follow that
  are live right now.
- **Sub-only content** *(best-effort — see the caveat at the bottom)*.

Login uses Twitch's **Device Code flow**: the TV shows a short code, you approve
it on your phone, and no password is ever typed on the TV or stored. There is no
backend and no secret — Twellie talks to Twitch directly with **your own**
Twitch application's Client ID.

## Step 1 — Register a free Twitch app (once)

You need a Client ID from a Twitch application registered to your account.

1. Go to **<https://dev.twitch.tv/console/apps>** and sign in.
2. Click **Register Your Application**.
3. Fill in:
   - **Name:** anything, e.g. `Twellie on my TV` (it must be unique across Twitch).
   - **OAuth Redirect URLs:** `http://localhost` — the device flow doesn't use
     it, but the field is required.
   - **Category:** *Application Integration* (or *Other*).
   - **Client Type:** **Public**. ← important: the device flow is for public
     clients, which have **no secret**.
4. Click **Create**, then **Manage** on your new app and copy the **Client ID**
   (a ~30-character string). You do **not** need the client secret.

## Step 2 — Log in on the TV

1. In Twellie, move up to the **● Log in** chip in the top bar and press OK
   (or open the **Followed** tab).
2. Enter your **Client ID** and choose **Log in**.
3. The TV shows a code and a URL. On your phone or computer, open
   **<https://www.twitch.tv/activate>**, sign in, and enter the code (the URL the
   TV shows already includes it).
4. Approve the requested permission (`user:read:follows`). Twellie picks up the
   login automatically and drops you on the **Followed** tab.

To **log out**, open the account chip again and choose **Log out** (this also
revokes the token with Twitch).

### Harness shortcut

In the browser harness you can prefill the Client ID with a query parameter:

```
http://localhost:8080/?clientId=<your-client-id>
```

## What's stored, and where

Only the resulting access/refresh tokens and your user id/name are saved, in the
device's local storage (`localStorage`, namespaced `tw.`). Nothing is sent
anywhere except Twitch's own `id.twitch.tv` / `api.twitch.tv`. Logging out clears
it and revokes the token.

## Caveat: sub-only content

Followed channels work through Twitch's documented **Helix** API and are
reliable. **Sub-only playback is best-effort:** when you're logged in, Twellie
includes your token on the GraphQL playback request, but whether Twitch honours a
token minted by a third-party app for that request can change without notice. If
a sub-only stream won't start, that's the reason — it isn't a bug in the app, and
there's no fully-supported public path for it from a third-party client.
