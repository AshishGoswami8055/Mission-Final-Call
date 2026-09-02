import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
import {
  disconnectYouTube,
  exchangeCodeForTokens,
  generateAuthUrl,
  getYouTubeStatus,
  isYouTubeConfigured,
} from "../services/youtubeUploadService.js";
import {
  isAdminEnvSyncEnabled,
  isAdminSignupAllowed,
  normalizeAdminEmail,
  publicAdmin,
  validateAdminPassword,
} from "../utils/adminAuth.js";

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });

const authPayload = (admin) => ({
  token: generateToken(admin._id),
  admin: publicAdmin(admin),
});

export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
  if (!admin) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  return res.json(authPayload(admin));
};

export const registerAdmin = async (req, res) => {
  if (!isAdminSignupAllowed()) {
    return res.status(403).json({
      message: "Account creation is disabled. Ask the workspace owner to set ALLOW_ADMIN_SIGNUP=1.",
    });
  }

  const email = normalizeAdminEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || "").trim() || "Admin";
  const passwordError = validateAdminPassword(password);

  if (!email) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ email, password: hash, name });
    return res.status(201).json(authPayload(admin));
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists. Sign in instead." });
    }
    return res.status(500).json({ message: err.message || "Could not create account" });
  }
};

export const updateOwnPassword = async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const nextPassword = String(req.body?.password || "");
  const passwordError = validateAdminPassword(nextPassword);
  if (!currentPassword) {
    return res.status(400).json({ message: "Current password is required" });
  }
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  const admin = await Admin.findById(req.user._id);
  if (!admin) {
    return res.status(401).json({ message: "Invalid token user" });
  }
  const matches = await bcrypt.compare(currentPassword, admin.password);
  if (!matches) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }

  admin.password = await bcrypt.hash(nextPassword, 10);
  await admin.save();
  return res.json({ message: "Password updated", admin: publicAdmin(admin) });
};

export const me = async (req, res) => {
  return res.json(req.user);
};

/**
 * GET /api/auth/youtube/status — is the YouTube uploader ready?
 * Authenticated route. Returns { configured, connected, accountEmail, channelTitle }.
 */
export const youTubeStatus = async (req, res) => {
  try {
    const status = await getYouTubeStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to read YouTube status" });
  }
};

/**
 * GET /api/auth/youtube/connect — return Google's OAuth consent URL.
 * The frontend opens it in a popup / new tab. After consent, Google
 * redirects to /api/auth/youtube/callback with ?code=...
 */
export const youTubeStartAuth = async (req, res) => {
  try {
    if (!isYouTubeConfigured()) {
      return res.status(400).json({
        message:
          "Google OAuth is not configured on this server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in server/.env, then restart.",
      });
    }
    const url = generateAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to start YouTube OAuth" });
  }
};

/**
 * GET /api/auth/youtube/callback — Google redirects here with ?code=...
 * Public route (no JWT) because Google does the redirect; security is provided by:
 *  - Google issued the code
 *  - The exchange uses our server-side client_secret
 *  - The stored refresh token is only useful inside this server.
 *
 * Renders a small HTML page that closes itself / signals success to the parent.
 */
export const youTubeOAuthCallback = async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res
      .status(400)
      .send(`<html><body style="font-family:system-ui">YouTube authorization was cancelled or failed: ${error}</body></html>`);
  }
  if (!code) {
    return res.status(400).send("<html><body>Missing OAuth code</body></html>");
  }
  try {
    const result = await exchangeCodeForTokens(String(code));
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>YouTube connected</title></head>
<body style="font-family:system-ui;padding:32px;text-align:center;background:#f8fafc;color:#0f172a">
  <h2 style="margin:0 0 6px">YouTube connected ✓</h2>
  <p style="margin:0 0 18px;color:#475569">${result.channelTitle ? `Channel: <b>${result.channelTitle}</b>` : ""} ${result.email ? `(${result.email})` : ""}</p>
  <p style="color:#64748b">You can close this window. The app will detect the connection automatically.</p>
  <script>
    try { if (window.opener) { window.opener.postMessage({ type: 'youtube-oauth-complete' }, '*'); } } catch (e) {}
    setTimeout(function(){ try { window.close(); } catch (e) {} }, 1200);
  </script>
</body></html>`);
  } catch (err) {
    return res
      .status(500)
      .send(`<html><body style="font-family:system-ui;padding:32px"><h3>Could not finish YouTube authorization</h3><pre>${(err.message || "").replace(/</g, "&lt;")}</pre></body></html>`);
  }
};

/** DELETE /api/auth/youtube — clear stored refresh token. */
export const youTubeDisconnect = async (req, res) => {
  try {
    await disconnectYouTube();
    res.json({ message: "YouTube disconnected" });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to disconnect YouTube" });
  }
};

export const ensureDefaultAdmin = async () => {
  const defaultEmail = normalizeAdminEmail(process.env.ADMIN_EMAIL);
  const defaultPassword = String(process.env.ADMIN_PASSWORD || "");
  const defaultName = String(process.env.ADMIN_NAME || "").trim() || "Course Admin";
  const placeholder = !defaultEmail || defaultEmail.includes("your.email@") || defaultEmail === "demo@cdsjourney.local";

  if (placeholder || !defaultPassword || defaultPassword === "CHANGE_ME") {
    if (!isAdminSignupAllowed()) {
      console.warn("ADMIN_EMAIL/ADMIN_PASSWORD not set, skipping default admin seed");
    }
    return;
  }

  const existing = await Admin.findOne({ email: defaultEmail });
  if (existing) {
    if (!isAdminEnvSyncEnabled()) return;
    existing.password = await bcrypt.hash(defaultPassword, 10);
    existing.name = defaultName;
    await existing.save();
    console.log(`[auth] Synced password/name for ${defaultEmail} from env`);
    return;
  }

  const hash = await bcrypt.hash(defaultPassword, 10);
  await Admin.create({
    email: defaultEmail,
    password: hash,
    name: defaultName,
  });
  console.log(`[auth] Admin account created for ${defaultEmail}`);
};
