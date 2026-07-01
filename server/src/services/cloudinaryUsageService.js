import { getCloudConfig, listAvailableClouds } from "../config/cloudinary.js";

const extractUsageErrorMessage = (json, status) => {
  if (!json || typeof json !== "object") return `HTTP ${status}`;
  const err = json.error;
  if (typeof err === "string") return err;
  if (err && typeof err.message === "string") return err.message;
  if (typeof json.message === "string") return json.message;
  return `HTTP ${status}`;
};

const usageAuthHint = (cloudType) => {
  const upper = String(cloudType || "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `This key cannot read Admin “usage” (403). Options: (1) In Cloudinary Console for this product, use an API key with Usage/Admin read permission, or the default dashboard key. (2) Keep your restricted key for uploads and add optional env: CLOUDINARY_${upper}_USAGE_API_KEY + CLOUDINARY_${upper}_USAGE_API_SECRET with a master-capable pair for the usage panel only.`;
};

const formatBytes = (n) => {
  if (n == null || Number.isNaN(n)) return null;
  const v = Number(n);
  if (v < 1024) return `${Math.round(v)} B`;
  const kb = v / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(2) : gb.toFixed(1)} GB`;
};

const USAGE_CACHE_TTL_MS = 60_000;
let usageCache = { at: 0, payload: null };

const parseStorageLimitFromApi = (json) => {
  const storage = json?.storage || {};
  const mediaLimits = json?.media_limits || {};
  const candidates = [
    storage.limit,
    storage.credits_limit,
    storage.usage_limit,
    storage.limit_bytes,
    mediaLimits.storage_bytes,
    mediaLimits.max_storage_bytes,
    mediaLimits.max_storage_in_bytes,
    json?.limits?.storage,
    json?.limits?.storage_bytes,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

/** Cloudinary Free = 25 GB storage; used when Admin API omits byte limits. */
const resolveStorageLimitFromPlan = (plan) => {
  const key = String(plan || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, "");
  if (!key || key.includes("free")) return 25 * 1024 * 1024 * 1024;
  if (key.includes("plus")) return 100 * 1024 * 1024 * 1024;
  if (key.includes("advanced")) return 250 * 1024 * 1024 * 1024;
  return 25 * 1024 * 1024 * 1024;
};

const buildConsoleUrls = (cloudName) => {
  if (!cloudName) return {};
  const base = `https://console.cloudinary.com/console/c-${encodeURIComponent(cloudName)}`;
  return {
    dashboard: base,
    mediaLibrary: `${base}/media_library`,
    usage: `${base}/settings/usage`,
    settings: `${base}/settings`,
  };
};

/**
 * Fetch current-period usage for one Cloudinary account (Admin API).
 * @see https://cloudinary.com/documentation/admin_api#usage
 */
export const fetchUsageForCloud = async (cloudType) => {
  const cfg = getCloudConfig(cloudType);
  if (!cfg) {
    return {
      cloudType,
      ok: false,
      error: "Not configured",
    };
  }

  if (cfg.usageDisabled) {
    return {
      cloudType,
      cloudName: cfg.cloud_name,
      ok: true,
      usageDisabled: true,
    };
  }

  const { cloud_name, api_key, api_secret, usageApiKey, usageApiSecret } = cfg;
  const keyForUsage = usageApiKey && usageApiSecret ? usageApiKey : api_key;
  const secretForUsage = usageApiKey && usageApiSecret ? usageApiSecret : api_secret;
  const auth = Buffer.from(`${keyForUsage}:${secretForUsage}`).toString("base64");
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud_name)}/usage`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        cloudType,
        cloudName: cloud_name,
        ok: false,
        error: `Invalid JSON (${res.status})`,
      };
    }

    if (!res.ok) {
      const msg = extractUsageErrorMessage(json, res.status);
      const permissionHint =
        res.status === 403 || /forbidden|missing permissions|actions=\[\"read\"\]/i.test(msg)
          ? usageAuthHint(cloudType)
          : null;
      return {
        cloudType,
        cloudName: cloud_name,
        ok: false,
        httpStatus: res.status,
        error: msg,
        permissionHint,
        usedDedicatedUsageCredentials: Boolean(usageApiKey && usageApiSecret),
      };
    }

    const storage = json.storage || {};
    const bandwidth = json.bandwidth || {};
    const credits = json.credits || json.credit || {};
    const storageBytes =
      typeof storage.usage === "number"
        ? storage.usage
        : typeof storage.usage_in_bytes === "number"
          ? storage.usage_in_bytes
          : null;
    const derivedBytes =
      typeof storage.derived_usage === "number" ? storage.derived_usage : null;
    const bandwidthBytes =
      typeof bandwidth.usage === "number"
        ? bandwidth.usage
        : typeof bandwidth.usage_in_bytes === "number"
          ? bandwidth.usage_in_bytes
          : null;

    let creditsPercentUsed = null;
    let creditsLabel = null;
    if (typeof credits.usage_percent === "number") {
      creditsPercentUsed = credits.usage_percent;
      creditsLabel = `${credits.usage_percent.toFixed(1)}% of plan credits used`;
    } else if (typeof credits.used_percent === "number") {
      creditsPercentUsed = credits.used_percent;
      creditsLabel = `${credits.used_percent.toFixed(1)}% of plan credits used`;
    } else if (credits.used != null && credits.limit != null && Number(credits.limit) > 0) {
      creditsPercentUsed = (Number(credits.used) / Number(credits.limit)) * 100;
      creditsLabel = `${creditsPercentUsed.toFixed(1)}% of credit limit`;
    }

    const plan = json.plan || json.media_limits?.plan || null;
    const lastUpdated = json.last_updated || json.last_updated_at || null;
    const apiStorageLimitBytes = parseStorageLimitFromApi(json);
    const storageLimitBytes = apiStorageLimitBytes ?? resolveStorageLimitFromPlan(plan);
    const storageLimitFromPlan = apiStorageLimitBytes == null;
    const totalStorageBytes =
      storageBytes != null && derivedBytes != null
        ? storageBytes + derivedBytes
        : storageBytes;
    const storageRemainingBytes =
      storageLimitBytes != null && totalStorageBytes != null
        ? Math.max(0, storageLimitBytes - totalStorageBytes)
        : null;
    const storagePercentUsed =
      storageLimitBytes != null && totalStorageBytes != null && storageLimitBytes > 0
        ? Math.min(100, (totalStorageBytes / storageLimitBytes) * 100)
        : null;

    return {
      cloudType,
      cloudName: cloud_name,
      ok: true,
      usedDedicatedUsageCredentials: Boolean(usageApiKey && usageApiSecret),
      plan,
      lastUpdated,
      storageBytes,
      storageDerivedBytes: derivedBytes,
      storageTotalBytes: totalStorageBytes,
      storageLimitBytes,
      storageRemainingBytes,
      storagePercentUsed,
      storageLimitFromPlan: Boolean(storageLimitFromPlan),
      storageLabel: storageBytes != null ? formatBytes(storageBytes) : null,
      derivedLabel: derivedBytes != null ? formatBytes(derivedBytes) : null,
      storageTotalLabel: totalStorageBytes != null ? formatBytes(totalStorageBytes) : null,
      storageLimitLabel: storageLimitBytes != null ? formatBytes(storageLimitBytes) : null,
      storageRemainingLabel:
        storageRemainingBytes != null ? formatBytes(storageRemainingBytes) : null,
      bandwidthBytes,
      bandwidthLabel: bandwidthBytes != null ? formatBytes(bandwidthBytes) : null,
      creditsPercentUsed,
      creditsLabel,
      objectsCount: json.objects?.count ?? json.resources ?? null,
      consoleUrls: buildConsoleUrls(cloud_name),
    };
  } catch (e) {
    return {
      cloudType,
      cloudName: cloud_name,
      ok: false,
      error: e.message || "Usage request failed",
    };
  }
};

export const fetchAllCloudinaryUsage = async ({ refresh = false } = {}) => {
  const now = Date.now();
  if (!refresh && usageCache.payload && now - usageCache.at < USAGE_CACHE_TTL_MS) {
    return { ...usageCache.payload, cached: true, cachedAt: new Date(usageCache.at).toISOString() };
  }

  const keys = listAvailableClouds();
  const items = await Promise.all(keys.map((k) => fetchUsageForCloud(k)));
  const payload = {
    items,
    refreshedAt: new Date().toISOString(),
    cached: false,
  };
  usageCache = { at: now, payload };
  return payload;
};
