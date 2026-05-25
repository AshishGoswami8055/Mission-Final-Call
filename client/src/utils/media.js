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

/** GramJS-streamed Telegram media (proxied through our API). */
export const isTelegramStreamContent = (item) =>
  Boolean(
    item?.telegramMessageId &&
    item?.telegramChannelId &&
    item?.type === "video" &&
    item?.sourceType !== "cloudinary" &&
    item?.sourceType !== "upload" &&
    (item.sourceType === "telegram" || item.telegramSource === true)
  );

const resolveApiBase = () => {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (import.meta.env.DEV) return "/api";
  return "/api";
};

export const getTelegramStreamUrl = (item) => {
  if (!isTelegramStreamContent(item)) return "";
  return buildTelegramPreviewStreamUrl(item.telegramChannelId, item.telegramMessageId);
};

/** Preview / stream URL for Telegram media before import (channelId + messageId). */
export const buildTelegramPreviewStreamUrl = (channelId, messageId) => {
  if (!channelId || !messageId) return "";
  const apiBase = resolveApiBase();
  let url = `${apiBase}/telegram/stream/${encodeURIComponent(messageId)}?channelId=${encodeURIComponent(channelId)}`;
  try {
    const token = localStorage.getItem("cds_token");
    if (token) url += `&token=${encodeURIComponent(token)}`;
  } catch {
    // ignore storage errors
  }
  return url;
};

/** Legacy Telegram t.me link stored when the video file is not on the server. */
export const getTelegramVideoUrl = (item) => {
  if (!item || item.type !== "video") return "";
  if (isTelegramStreamContent(item)) return "";
  if (item.videoSourceType === "telegram") {
    return String(item.videoUrl || item.url || "").trim();
  }
  if (isTelegramUrl(item.videoUrl)) return String(item.videoUrl).trim();
  if (isTelegramUrl(item.url)) return String(item.url).trim();
  return "";
};

export const isTelegramVideo = (item) =>
  Boolean(getTelegramVideoUrl(item) || (item?.type === "video" && isTelegramStreamContent(item)));

export const isTelegramLinkVideo = (item) => Boolean(getTelegramVideoUrl(item));

export const hasLocalVideoFile = (item) =>
  item?.type === "video" &&
  item?.videoSourceType === "local" &&
  Boolean(item.filePath);

/** Video can be saved to the localhost PC library for smooth playback. */
export const canLocalLibraryDownload = (item) =>
  Boolean(
    item?.type === "video" &&
      !isTelegramLinkVideo(item) &&
      (isTelegramStreamContent(item) ||
        item.sourceType === "cloudinary" ||
        (item.sourceType === "upload" && item.filePath))
  );

/**
 * Resolve the playable/viewable source URL for any content item:
 * - Telegram stream (GramJS proxy) → /api/telegram/stream/:messageId
 * - Telegram link (legacy) → t.me URL
 * - Cloudinary → videoUrl
 * - Local upload → /uploads/...
 * - Other URL types → url
 */
export const resolveContentSrc = (item) => {
  if (!item) return "";
  const streamUrl = getTelegramStreamUrl(item);
  if (streamUrl) return streamUrl;
  const telegramLink = getTelegramVideoUrl(item);
  if (telegramLink) return telegramLink;
  if (item.sourceType === "cloudinary") return item.videoUrl || item.url || "";
  if (item.sourceType === "upload") return toAbsoluteMediaUrl(item.filePath);
  return item.url || item.videoUrl || "";
};

export const formatFileSize = (bytes = 0) => {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const formatDuration = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!safe) return "";
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

export const formatTelegramMediaMeta = (item) => {
  const mediaType = String(item?.mediaType || item?.type || "").toUpperCase();
  const parts = [mediaType];
  if (mediaType === "VIDEO") {
    const duration = formatDuration(item?.duration);
    if (duration) parts.push(duration);
  }
  if (item?.size) parts.push(formatFileSize(item.size));
  return parts.filter(Boolean).join(" · ");
};
