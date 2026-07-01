import { getCloudConfig, getDefaultCloud, listAvailableClouds } from "../config/cloudinary.js";

export const extractCloudNameFromUrl = (url) => {
  const match = String(url || "").match(/res\.cloudinary\.com\/([^/]+)\//i);
  return match ? match[1] : null;
};

/** Strip Cloudinary upload params (version, transformations) from path segments after /upload/. */
const stripCloudinaryUploadParams = (pathAfterUpload) => {
  const segments = String(pathAfterUpload || "")
    .split("?")[0]
    .split("/")
    .filter(Boolean);
  while (segments.length > 1) {
    const head = segments[0];
    if (/^v\d+$/i.test(head)) {
      segments.shift();
      continue;
    }
    // Transformation tokens: w_300, c_fill, fl_something, or comma-separated chains
    if (/^[a-z]{1,3}_[^/]+$/i.test(head) || head.includes(",")) {
      segments.shift();
      continue;
    }
    break;
  }
  let publicId = decodeURIComponent(segments.join("/"));
  publicId = publicId.replace(/\.[^./]+$/, "");
  return publicId || null;
};

/** Parse public_id from a Cloudinary delivery URL (video / raw / image). */
export const extractPublicIdFromCloudinaryUrl = (url) => {
  const value = String(url || "");
  if (!/res\.cloudinary\.com/i.test(value)) return null;
  const match = value.match(/\/(video|raw|image)\/upload\/(.+)$/i);
  if (!match) return null;
  return stripCloudinaryUploadParams(match[2]);
};

export const detectResourceTypeFromUrl = (url) => {
  const match = String(url || "").match(/\/(video|raw|image)\/upload\//i);
  return match ? match[1].toLowerCase() : null;
};

export const resolveCloudTypeByCloudName = (cloudName) => {
  if (!cloudName) return getDefaultCloud();
  for (const key of listAvailableClouds()) {
    const cfg = getCloudConfig(key);
    if (cfg?.cloud_name === cloudName) return key;
  }
  return getDefaultCloud();
};

const collectCloudinaryUrls = (record, urlFields = []) => {
  const urls = [];
  for (const field of urlFields) {
    const value = record?.[field];
    if (value && /res\.cloudinary\.com/i.test(String(value))) urls.push(String(value));
  }
  return urls;
};

/**
 * Resolve Cloudinary destroy refs from a content row, including legacy rows
 * that only stored the delivery URL.
 */
export const resolveCloudinaryAssetRefs = (content) => {
  const urls = collectCloudinaryUrls(content, ["videoUrl", "url", "filePath"]);

  let publicId = content?.publicId ? String(content.publicId).trim() : "";
  let cloudType = content?.cloudType || null;
  let resourceType = content?.type === "pdf" ? "raw" : "video";

  if (!publicId) {
    for (const url of urls) {
      publicId = extractPublicIdFromCloudinaryUrl(url);
      if (!publicId) continue;
      cloudType = resolveCloudTypeByCloudName(extractCloudNameFromUrl(url));
      resourceType = detectResourceTypeFromUrl(url) || resourceType;
      break;
    }
  }

  if (!cloudType) cloudType = getDefaultCloud();

  let thumbnailAsset = null;
  const thumbnailUrl = content?.thumbnail;
  if (thumbnailUrl && /res\.cloudinary\.com/i.test(String(thumbnailUrl))) {
    const thumbPublicId = extractPublicIdFromCloudinaryUrl(thumbnailUrl);
    if (thumbPublicId) {
      thumbnailAsset = {
        cloudType: resolveCloudTypeByCloudName(extractCloudNameFromUrl(thumbnailUrl)),
        publicId: thumbPublicId,
        resourceType: "image",
      };
    }
  }

  return {
    publicId: publicId || null,
    cloudType,
    resourceType,
    thumbnailAsset,
    isCloudinary:
      content?.sourceType === "cloudinary" ||
      urls.length > 0 ||
      Boolean(publicId),
  };
};

/** Resolve Cloudinary destroy refs for PYQ / lesson paper rows. */
export const resolvePaperCloudinaryAssetRefs = (paper) => {
  const urls = collectCloudinaryUrls(paper, ["pdfUrl", "url"]);

  let publicId = paper?.publicId ? String(paper.publicId).trim() : "";
  let cloudType = paper?.cloudType || null;

  if (!publicId) {
    for (const url of urls) {
      publicId = extractPublicIdFromCloudinaryUrl(url);
      if (!publicId) continue;
      cloudType = resolveCloudTypeByCloudName(extractCloudNameFromUrl(url));
      break;
    }
  }

  if (!cloudType) cloudType = getDefaultCloud();

  return {
    publicId: publicId || null,
    cloudType,
    resourceType: "raw",
    isCloudinary: paper?.sourceType === "cloudinary" || urls.length > 0 || Boolean(publicId),
  };
};
