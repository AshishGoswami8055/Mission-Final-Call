const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mission-final-call.vercel.app",
];

/** Comma-separated extra origins via CLIENT_URLS, plus CLIENT_URL. */
export const getAllowedOrigins = () => {
  const fromEnv = (process.env.CLIENT_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const primary = String(process.env.CLIENT_URL || "").trim();
  return [...new Set([...(primary ? [primary] : []), ...fromEnv, ...DEFAULT_ORIGINS])];
};

export const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (getAllowedOrigins().includes(origin)) return true;
  // Vercel production + preview deployments
  if (/^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(origin)) return true;
  return false;
};

export const createCorsOptions = () => ({
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: false,
});

/** Reflect allowed request origin on streaming/media responses. */
export const applyCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
};
