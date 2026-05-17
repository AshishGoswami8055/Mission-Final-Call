# Direct upload to YouTube (Unlisted) — one-time setup

This lets the app upload your local video files directly to your YouTube
channel as **Unlisted**, the same way it uploads to Cloudinary today.

The whole thing is **free**. The only constraints are:

- A Google Cloud Console project (free).
- Your Gmail / Google account that owns the YouTube channel.
- Default API quota is **10,000 units/day**, and `videos.insert` costs
  **1,600 units**, so you can upload **~6 videos per day** before the daily
  quota resets at midnight Pacific. You can request more on the Google Cloud
  quota page if needed.

You only need to do this once. After that, every upload from the app uses a
stored refresh token automatically — no further sign-in.

---

## 1. Create / pick a Google Cloud project

1. Open <https://console.cloud.google.com/>.
2. Top-bar project dropdown → **New Project** (or use an existing one).
   Name it anything, e.g. **CDS Journey**.

## 2. Enable the YouTube Data API v3

1. Left menu → **APIs & Services → Library**.
2. Search **"YouTube Data API v3"** → click it → **Enable**.

## 3. Configure the OAuth consent screen

1. Left menu → **APIs & Services → OAuth consent screen**.
2. Choose **External** → Create.
3. Fill required fields:
   - **App name**: e.g. `CDS Journey`
   - **User support email**: your email
   - **Developer contact email**: your email
4. **Scopes** step → click **Add or remove scopes** → search and check:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
   Save.
5. **Test users** step → **Add users** → add **your own Gmail address** (the
   one that owns the YouTube channel). Save.
   You stay in "Testing" mode forever; that's fine for personal use.

## 4. Create OAuth 2.0 Client credentials

1. Left menu → **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type**: `Web application`.
3. **Name**: anything, e.g. `CDS Journey Server`.
4. **Authorized redirect URIs** → **Add URI**:
   ```
   http://localhost:5000/api/auth/youtube/callback
   ```
   (If you later host this on a domain, also add e.g.
   `https://your.domain.tld/api/auth/youtube/callback`.)
5. Click **Create**. You'll get a **Client ID** and **Client Secret** —
   copy them.

## 5. Put the credentials in `server/.env`

Open `server/.env` and add (or update) these three lines anywhere:

```env
GOOGLE_CLIENT_ID=<paste from step 4>
GOOGLE_CLIENT_SECRET=<paste from step 4>
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/youtube/callback
```

Restart the server (the `npm run dev` terminal — Ctrl+C, then `npm run dev`
again). `dotenv` only reads the file at boot.

## 6. Connect your channel from the app (one-time)

1. Open the app → **Add Content**.
2. Pick **Upload** as the source.
3. In the **Upload destination** card, pick **YouTube (Unlisted)**.
4. Click **Connect YouTube**. A Google sign-in popup opens.
5. Sign in with the **same Google account** you added as a test user in
   step 3. Grant the **upload + read-only** scopes.
6. The popup closes itself. The destination card now shows
   `Connected · <your channel name>`.

That's it — every future upload sends bytes straight from your machine →
your server → YouTube, with the existing live progress loader. The video
ends up Unlisted on your channel and the app stores a normal YouTube URL
that the player embeds.

---

## How it works internally

- **Token storage**: `server/src/models/OAuthCredentials.js` stores one row
  per provider (`youtube`). The refresh token is what we keep long term;
  short-lived access tokens are auto-refreshed by `googleapis` and we
  persist the new ones via the `tokens` event listener.
- **Routes** (in `server/src/routes/authRoutes.js`):
  - `GET /api/auth/youtube/status` — `{ configured, connected, accountEmail, channelTitle }`.
  - `GET /api/auth/youtube/connect` — returns the consent URL the popup opens.
  - `GET /api/auth/youtube/callback` — Google redirects here with `?code=…`; we
    exchange it, store the refresh token, then return a small HTML page that
    closes the popup and posts a `youtube-oauth-complete` message to the parent.
  - `DELETE /api/auth/youtube` — clears the stored refresh token.
- **Upload service**: `server/src/services/youtubeUploadService.js` uses
  `googleapis`' `youtube.videos.insert` with a streamed `media.body` so we
  can emit per-byte progress (same UI loader as Cloudinary).
- **Content controller** branches on `req.body.uploadDestination`. When it's
  `youtube`, the new `Content` doc is saved with `sourceType: "url"` and the
  YouTube watch URL — the existing video player already handles YouTube
  URLs as embeds, so no player change is needed.

## Troubleshooting

- **"Google did not return a refresh_token"**: visit
  <https://myaccount.google.com/connections>, remove the app's previous
  authorization, then click **Connect YouTube** again.
- **"Quota exceeded"**: you've used all 10,000 daily units (~6 uploads).
  Wait until midnight Pacific or request more quota in
  Google Cloud Console → APIs & Services → YouTube Data API v3 → Quotas.
- **Popup blocker**: allow popups for `http://localhost:5173`.
- **"redirect_uri_mismatch"**: the redirect URI in step 4 must match
  `GOOGLE_REDIRECT_URI` in `server/.env` exactly (scheme, host, port, path).

## Privacy / safety notes

- The credentials in `server/.env` are server-only — not exposed to the
  browser.
- Only the refresh token, an account email, and your channel id/title are
  stored in MongoDB. No video bytes are ever stored in the DB.
- Videos are uploaded **Unlisted** by default. They are not shown in your
  channel's public feed or in YouTube search; only people with the URL can
  watch.
