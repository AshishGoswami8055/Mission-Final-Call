import mongoose from "mongoose";

/**
 * Per-provider OAuth credentials. Single-admin app, so we store one row per
 * provider (e.g. "youtube"). The refresh_token is what we actually need long
 * term — Google issues short-lived access tokens and we trade the refresh
 * token for new ones on demand.
 */
const oauthCredentialsSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    refreshToken: { type: String, default: null },
    accessToken: { type: String, default: null },
    expiryDate: { type: Number, default: null },
    scope: { type: String, default: null },
    tokenType: { type: String, default: null },
    accountEmail: { type: String, default: null },
    accountChannelId: { type: String, default: null },
    accountChannelTitle: { type: String, default: null },
  },
  { timestamps: true }
);

const OAuthCredentials = mongoose.model("OAuthCredentials", oauthCredentialsSchema);

export default OAuthCredentials;
