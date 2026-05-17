import { listAvailableClouds, getCloudConfig } from "../config/cloudinary.js";

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

    return {
      cloudType,
      cloudName: cloud_name,
      ok: true,
      usedDedicatedUsageCredentials: Boolean(usageApiKey && usageApiSecret),
      plan,
      lastUpdated,
      storageBytes,
      storageDerivedBytes: derivedBytes,
      storageLabel: storageBytes != null ? formatBytes(storageBytes) : null,
      derivedLabel: derivedBytes != null ? formatBytes(derivedBytes) : null,
      bandwidthBytes,
      bandwidthLabel: bandwidthBytes != null ? formatBytes(bandwidthBytes) : null,
      creditsPercentUsed,
      creditsLabel,
      objectsCount: json.objects?.count ?? json.resources ?? null,
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

export const fetchAllCloudinaryUsage = async () => {
  const keys = listAvailableClouds();
  const items = await Promise.all(keys.map((k) => fetchUsageForCloud(k)));
  return { items };
};
