import { v2 as cloudinary } from "cloudinary";

/**
 * Multi-account Cloudinary registry.
 *
 * Configure clouds through environment variables. Set `CLOUDINARY_CLOUDS` to a
 * comma-separated list of cloud keys (default: "cloud1,cloud2"). For each key
 * supply three vars:
 *
 *   CLOUDINARY_<KEY>_NAME
 *   CLOUDINARY_<KEY>_API_KEY
 *   CLOUDINARY_<KEY>_API_SECRET
 *
 * Optional (per cloud key) — **only for GET /usage** (Admin API). Use when your main
 * `CLOUDINARY_<KEY>_API_KEY` is a restricted Product Environment key that can upload
 * but cannot read usage; set a master-capable key pair here so the dashboard can
 * still show storage/credits:
 *
 *   CLOUDINARY_<KEY>_USAGE_API_KEY
 *   CLOUDINARY_<KEY>_USAGE_API_SECRET
 *
 * Optional:
 *   CLOUDINARY_DEFAULT_CLOUD=<key>   // fallback when a subject has no mapping
 *
 * To add a third (or fourth, …) account later you only:
 *   1. Append the new key to CLOUDINARY_CLOUDS, e.g. "cloud1,cloud2,cloud3"
 *   2. Add the 3 env vars for that key
 * No code change required.
 */

const ENV_KEY = (key) => String(key).toUpperCase().replace(/[^A-Z0-9]/g, "_");

const parseCloudList = () =>
  String(process.env.CLOUDINARY_CLOUDS || "cloud1,cloud2")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);

const readCloudConfig = (key) => {
  const upper = ENV_KEY(key);
  const cloud_name = process.env[`CLOUDINARY_${upper}_NAME`]?.trim();
  const api_key = process.env[`CLOUDINARY_${upper}_API_KEY`]?.trim();
  const api_secret = process.env[`CLOUDINARY_${upper}_API_SECRET`]?.trim();
  const usageApiKey = process.env[`CLOUDINARY_${upper}_USAGE_API_KEY`]?.trim() || null;
  const usageApiSecret = process.env[`CLOUDINARY_${upper}_USAGE_API_SECRET`]?.trim() || null;
  const usageDisabled = /^(1|true|yes|on)$/i.test(
    String(process.env[`CLOUDINARY_${upper}_USAGE_DISABLED`] || "").trim()
  );
  if (!cloud_name || !api_key || !api_secret) return null;
  return {
    cloud_name,
    api_key,
    api_secret,
    secure: true,
    usageApiKey,
    usageApiSecret,
    usageDisabled,
  };
};

/** Credentials object safe to pass to the Cloudinary SDK (upload/destroy). */
export const pickCloudinarySdkConfig = (cfg) => {
  if (!cfg) return null;
  return {
    cloud_name: cfg.cloud_name,
    api_key: cfg.api_key,
    api_secret: cfg.api_secret,
    secure: cfg.secure !== false,
  };
};

const buildRegistry = () => {
  const keys = parseCloudList();
  const registry = new Map();
  for (const key of keys) {
    const cfg = readCloudConfig(key);
    if (cfg) {
      registry.set(key, cfg);
    } else {
      console.warn(
        `[cloudinary] Skipping "${key}" — missing CLOUDINARY_${ENV_KEY(
          key
        )}_NAME / _API_KEY / _API_SECRET`
      );
    }
  }
  return registry;
};

const computeDefaultCloud = (registry) => {
  const env = String(process.env.CLOUDINARY_DEFAULT_CLOUD || "").trim();
  if (env && registry.has(env)) return env;
  const first = registry.keys().next();
  return first.done ? null : first.value;
};

// Built lazily on first access so that env vars loaded by dotenv (which happens
// after this module is imported) are visible by the time we read them.
let _registry = null;
let _defaultCloud = null;

const ensureRegistry = () => {
  if (_registry) return;
  _registry = buildRegistry();
  _defaultCloud = computeDefaultCloud(_registry);
};

/** Rebuild the registry at runtime (useful in tests / after dotenv reload). */
export const reloadCloudRegistry = () => {
  _registry = buildRegistry();
  _defaultCloud = computeDefaultCloud(_registry);
};

export const listAvailableClouds = () => {
  ensureRegistry();
  return Array.from(_registry.keys());
};

export const isKnownCloud = (key) => {
  ensureRegistry();
  return _registry.has(String(key || ""));
};

export const getDefaultCloud = () => {
  ensureRegistry();
  return _defaultCloud;
};

export const getCloudConfig = (key) => {
  ensureRegistry();
  return _registry.get(String(key || "")) || null;
};

/**
 * Returns a `{ cloudinary, config }` pair for a given cloud key.
 * Throws if the key is not configured so callers fail loudly.
 */
export const getCloudinaryFor = (key) => {
  ensureRegistry();
  const config = _registry.get(String(key || ""));
  if (!config) {
    throw new Error(
      `Cloudinary account "${key}" is not configured. Available: ${listAvailableClouds().join(
        ", "
      ) || "(none)"}`
    );
  }
  return { cloudinary, config };
};

export { cloudinary };
