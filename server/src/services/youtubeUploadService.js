import fs from "node:fs";
import { google } from "googleapis";
import OAuthCredentials from "../models/OAuthCredentials.js";

/**
 * YouTube Data API v3 — direct uploader for personal/admin use.
 *
 * Setup (one-time, in Google Cloud Console — see SETUP_YOUTUBE.md):
 *   1. Create / pick a project.
 *   2. Enable "YouTube Data API v3".
 *   3. OAuth consent screen → External, add your email as Test User, scope = ".../auth/youtube.upload".
 *   4. Credentials → "OAuth 2.0 Client ID" → Application type "Web application".
 *   5. Authorized redirect URI: http://localhost:5000/api/auth/youtube/callback
 *   6. Put in server/.env:
 *        GOOGLE_CLIENT_ID=...
 *        GOOGLE_CLIENT_SECRET=...
 *        GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/youtube/callback
 *   7. In the app: Settings → Connect YouTube → authorize once. The refresh
 *      token is stored encrypted-at-rest in MongoDB and reused for every
 *      subsequent upload. No further sign-in is required.
 *
 * Quota: `videos.insert` costs **1600 units**. Default daily quota is 10,000
 *  (= ~6 uploads/day). You can request more via the Google Cloud quota page.
 */

export const YOUTUBE_PROVIDER = "youtube";
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export const isYouTubeConfigured = () =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );

const buildOAuth2Client = () => {
  if (!isYouTubeConfigured()) {
    throw new Error(
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in server/.env."
    );
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
};

export const generateAuthUrl = ({ state } = {}) => {
  const client = buildOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces refresh_token issuance every time
    scope: YOUTUBE_SCOPES,
    include_granted_scopes: true,
    state: state || undefined,
  });
};

export const exchangeCodeForTokens = async (code) => {
  const client = buildOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token. Visit https://myaccount.google.com/connections, remove the app's access for this account, then click 'Connect YouTube' again."
    );
  }
  client.setCredentials(tokens);

  // Fetch channel info for nicer UI display.
  let channelTitle = null;
  let channelId = null;
  let email = null;
  try {
    const youtube = google.youtube({ version: "v3", auth: client });
    const channels = await youtube.channels.list({ part: ["snippet"], mine: true });
    const item = channels.data.items?.[0];
    if (item) {
      channelId = item.id || null;
      channelTitle = item.snippet?.title || null;
    }
  } catch (err) {
    console.warn("[youtube] channels.list failed:", err.message);
  }
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const ui = await oauth2.userinfo.get();
    email = ui.data?.email || null;
  } catch {
    /* not critical */
  }

  await OAuthCredentials.findOneAndUpdate(
    { provider: YOUTUBE_PROVIDER },
    {
      provider: YOUTUBE_PROVIDER,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token || null,
      expiryDate: tokens.expiry_date || null,
      scope: tokens.scope || null,
      tokenType: tokens.token_type || null,
      accountEmail: email,
      accountChannelId: channelId,
      accountChannelTitle: channelTitle,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    refreshToken: tokens.refresh_token,
    email,
    channelId,
    channelTitle,
  };
};

export const getStoredCredentials = async () => {
  return OAuthCredentials.findOne({ provider: YOUTUBE_PROVIDER }).lean();
};

export const disconnectYouTube = async () => {
  await OAuthCredentials.deleteOne({ provider: YOUTUBE_PROVIDER });
  return { ok: true };
};

const buildAuthenticatedClient = async () => {
  const stored = await OAuthCredentials.findOne({ provider: YOUTUBE_PROVIDER });
  if (!stored?.refreshToken) {
    throw new Error("YouTube is not connected. Open Settings → Connect YouTube to authorize.");
  }
  const client = buildOAuth2Client();
  client.setCredentials({
    refresh_token: stored.refreshToken,
    access_token: stored.accessToken || undefined,
    expiry_date: stored.expiryDate || undefined,
  });

  // When googleapis refreshes the access token, persist the new one for next time.
  client.on("tokens", async (tokens) => {
    try {
      await OAuthCredentials.updateOne(
        { provider: YOUTUBE_PROVIDER },
        {
          $set: {
            ...(tokens.access_token ? { accessToken: tokens.access_token } : {}),
            ...(tokens.expiry_date ? { expiryDate: tokens.expiry_date } : {}),
            ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          },
        }
      );
    } catch (err) {
      console.warn("[youtube] failed to persist refreshed tokens:", err.message);
    }
  });

  return client;
};

/**
 * Upload a local video file to the connected YouTube channel as Unlisted.
 * Emits per-byte progress through `onProgress`.
 *
 * @param {Object} params
 * @param {string} params.filePath
 * @param {string} params.title
 * @param {string} [params.description]
 * @param {"unlisted"|"public"|"private"} [params.privacyStatus="unlisted"]
 * @param {string[]} [params.tags]
 * @param {string} [params.categoryId="27"]   // 27 = "Education"
 * @param {(p:{bytesUploaded:number,bytesTotal:number,percent:number,instantaneousBps:number})=>void} [params.onProgress]
 */
export const uploadVideoToYouTube = async ({
  filePath,
  title,
  description = "",
  privacyStatus = "unlisted",
  tags = [],
  categoryId = "27",
  onProgress,
}) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("uploadVideoToYouTube: input file not found");
  }
  const fileSize = fs.statSync(filePath).size;
  const auth = await buildAuthenticatedClient();
  const youtube = google.youtube({ version: "v3", auth });

  const fileStream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
  let bytesUploaded = 0;
  let lastEmitTs = 0;
  let lastEmitBytes = 0;

  fileStream.on("data", (chunk) => {
    bytesUploaded += chunk.length;
    const t = Date.now();
    const reachedEnd = bytesUploaded >= fileSize;
    if (typeof onProgress !== "function") return;
    if (reachedEnd || t - lastEmitTs > 200) {
      try {
        onProgress({
          bytesUploaded,
          bytesTotal: fileSize,
          percent: fileSize > 0 ? Math.min(100, (bytesUploaded / fileSize) * 100) : 0,
          instantaneousBps:
            t > lastEmitTs ? Math.max(0, ((bytesUploaded - lastEmitBytes) / ((t - lastEmitTs) / 1000))) : 0,
        });
      } catch {
        /* ignore */
      }
      lastEmitTs = t;
      lastEmitBytes = bytesUploaded;
    }
  });

  const requestBody = {
    snippet: {
      title: String(title || "Untitled").slice(0, 100),
      description: String(description || "").slice(0, 5000),
      tags: Array.isArray(tags) ? tags.slice(0, 20) : [],
      categoryId,
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };

  try {
    const response = await youtube.videos.insert(
      {
        part: ["snippet", "status"],
        requestBody,
        media: { body: fileStream },
        notifySubscribers: false,
      },
      {
        // Use a longer per-request timeout for large uploads (default is short).
        timeout: 30 * 60 * 1000,
      }
    );

    const data = response.data;
    if (!data?.id) {
      throw new Error("YouTube returned no video id (upload may have failed)");
    }
    return {
      videoId: data.id,
      url: `https://www.youtube.com/watch?v=${data.id}`,
      thumbnail: `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
      privacyStatus: data.status?.privacyStatus || privacyStatus,
      durationSeconds: null, // YouTube populates this asynchronously after processing
      raw: data,
    };
  } catch (err) {
    const apiMessage =
      err?.errors?.[0]?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      "YouTube upload failed";
    if (/quotaExceeded/i.test(apiMessage)) {
      throw new Error(
        `YouTube API quota exceeded for today (videos.insert costs 1600 units, default daily limit is 10000). Try again tomorrow or request a quota increase in Google Cloud Console. Original: ${apiMessage}`
      );
    }
    throw new Error(`YouTube: ${apiMessage}`);
  }
};

/**
 * Helper for the UI: returns a sanitised "is YouTube ready?" payload.
 */
export const getYouTubeStatus = async () => {
  const configured = isYouTubeConfigured();
  const stored = configured ? await OAuthCredentials.findOne({ provider: YOUTUBE_PROVIDER }).lean() : null;
  return {
    configured,
    connected: Boolean(stored?.refreshToken),
    accountEmail: stored?.accountEmail || null,
    channelTitle: stored?.accountChannelTitle || null,
    channelId: stored?.accountChannelId || null,
  };
};
