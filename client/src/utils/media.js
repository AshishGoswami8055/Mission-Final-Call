import { serverBaseUrl } from "../api/client";

/**
 * Mirrors server rules: app behaves as "localhost dev" when opened on these hosts.
 */
export const isLocalFrontend = () => {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
};

/**
 * Returns a URL suitable for iframes/links (PDF, video, etc.).
 * For paths starting with / we use the path as-is so the request goes to the
 * same origin (e.g. localhost:5173 in dev); Vite proxies /uploads to the backend.
 */
export const toAbsoluteMediaUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return url;
  return `${serverBaseUrl}${url}`;
};

export const isYouTubeUrl = (url = "") =>
  /(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url);

export const isTelegramUrl = (url = "") =>
  /^https?:\/\/(?:t\.me|telegram\.me)\//i.test(String(url || "").trim()) ||
  /^tg:\/\//i.test(String(url || "").trim());

/** Telegram / external link stored when the video file is not on the server. */
export const getTelegramVideoUrl = (item) => {
  if (!item || item.type !== "video") return "";
  if (item.videoSourceType === "telegram") {
    return String(item.videoUrl || item.url || "").trim();
  }
  if (isTelegramUrl(item.videoUrl)) return String(item.videoUrl).trim();
  if (isTelegramUrl(item.url)) return String(item.url).trim();
  return "";
};

export const isTelegramVideo = (item) => Boolean(getTelegramVideoUrl(item));

export const hasLocalVideoFile = (item) =>
  item?.type === "video" &&
  item?.videoSourceType === "local" &&
  Boolean(item.filePath);

/**
 * Resolve the playable/viewable source URL for any content item:
 * - Telegram (no upload) → videoUrl / url
 * - Cloudinary → videoUrl
 * - Local upload → /uploads/...
 * - Other URL types → url
 */
export const resolveContentSrc = (item) => {
  if (!item) return "";
  const telegramLink = getTelegramVideoUrl(item);
  if (telegramLink) return telegramLink;
  if (item.sourceType === "cloudinary") return item.videoUrl || "";
  if (item.sourceType === "upload") return toAbsoluteMediaUrl(item.filePath);
  return item.url || item.videoUrl || "";
};
