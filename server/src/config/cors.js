const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mission-final-call.vercel.app",
];

const IP_ORIGIN = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/i;

const TRYCLOUDFLARE_ORIGIN =
  /^https:\/\/[a-z0-9-]+(-[a-z0-9-]+)*\.trycloudflare\.com$/i;

export const getAllowedOrigins = () => {
  const fromEnv = (process.env.CLIENT_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const primary = String(process.env.CLIENT_URL || "").trim();
  const publicClient = String(process.env.PUBLIC_CLIENT_URL || "").trim();
  return [
    ...new Set([
      ...(primary ? [primary] : []),
      ...(publicClient ? [publicClient] : []),
      ...fromEnv,
      ...DEFAULT_ORIGINS,
    ]),
  ];
};

export const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (getAllowedOrigins().includes(origin)) return true;
  if (process.env.CORS_ALLOW_IP_ORIGINS === "true" && IP_ORIGIN.test(origin)) return true;
  if (process.env.CORS_ALLOW_CLOUDFLARE_TUNNEL === "true") {
    if (TRYCLOUDFLARE_ORIGIN.test(origin)) return true;
    const tunnelBase = String(
      process.env.CLOUDFLARE_TUNNEL_URL || process.env.PUBLIC_API_URL || ""
    )
      .trim()
      .replace(/\/$/, "");
    if (tunnelBase && origin === tunnelBase) return true;
  }
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

export const applyCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
};
