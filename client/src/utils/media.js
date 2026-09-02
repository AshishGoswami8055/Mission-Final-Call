import { getMediaApiBaseUrl, getServerBaseUrl } from "../api/client";

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
  if (url.startsWith("/")) {
    const serverBaseUrl = getServerBaseUrl();
    if (typeof window !== "undefined" && serverBaseUrl && serverBaseUrl !== window.location.origin) {
      return `${serverBaseUrl}${url}`;
    }
    return url;
  }
  return `${getServerBaseUrl()}${url}`;
};

/** Keep /api and /uploads on the page origin so canvas screenshot capture works in dev. */
export const preferSameOriginMediaUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("/")) return url;
  if (typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    /* ignore */
  }
  return url;
};

export const resolveVideoPlaybackUrl = (url) => preferSameOriginMediaUrl(toAbsoluteMediaUrl(url));

export const isYouTubeUrl = (url = "") =>
  /(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url);

export const extractYoutubeVideoId = (rawUrl = "") => {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").split("/")[0] || "";
    }
    return u.searchParams.get("v") || "";
  } catch {
    return String(rawUrl).split("/").pop()?.split("?")[0] || "";
  }
};

export const buildYoutubeWatchUrl = (rawUrl, seconds = 0) => {
  if (!rawUrl) return "";
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!sec) return rawUrl;
  const joiner = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${joiner}t=${sec}`;
};

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

export const getTelegramStreamUrl = (item) => {
  if (!isTelegramStreamContent(item)) return "";
  return buildTelegramPreviewStreamUrl(item.telegramChannelId, item.telegramMessageId);
};

/** Preview / stream URL for Telegram media before import (channelId + messageId). */
export const buildTelegramPreviewStreamUrl = (channelId, messageId) => {
  if (!channelId || !messageId) return "";
  const apiBase = getMediaApiBaseUrl();
  let url = `${apiBase}/telegram/stream/${encodeURIComponent(messageId)}?channelId=${encodeURIComponent(channelId)}`;
  try {
    const token = localStorage.getItem("cds_token");
    if (token) url += `&token=${encodeURIComponent(token)}`;
  } catch {
    // ignore storage errors
  }
  return url;
};

/** JPEG thumbnail for Telegram video preview in import UI. */
export const buildTelegramThumbnailUrl = (channelId, messageId) => {
  if (!channelId || !messageId) return "";
  const apiBase = getMediaApiBaseUrl();
  let url = `${apiBase}/telegram/thumbnail/${encodeURIComponent(messageId)}?channelId=${encodeURIComponent(channelId)}`;
  try {
    const token = localStorage.getItem("cds_token");
    if (token) url += `&token=${encodeURIComponent(token)}`;
  } catch {
    // ignore storage errors
  }
  return url;
};

/** Same stream with Content-Disposition attachment for saving to the user's PC. */
export const buildTelegramDownloadUrl = (channelId, messageId) => {
  const base = buildTelegramPreviewStreamUrl(channelId, messageId);
  if (!base) return "";
  return `${base}&download=1`;
};

const sanitizeDownloadFileName = (name, fallback = "document.pdf") => {
  const cleaned = String(name || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim();
  if (!cleaned) return fallback;
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
};

const parseContentDispositionFileName = (header) => {
  if (!header) return "";
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      /* ignore */
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(header);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();
  const plainMatch = /filename=([^;]+)/i.exec(header);
  return plainMatch?.[1]?.trim().replace(/^"|"$/g, "") || "";
};

/** Fetch a Telegram PDF/document and trigger the browser save dialog. */
export const downloadTelegramMediaToPc = async ({ channelId, messageId, fileName }) => {
  const url = buildTelegramDownloadUrl(channelId, messageId);
  if (!url) throw new Error("Missing channel or message id");

  const response = await fetch(url);
  if (!response.ok) {
    let message = "Download failed";
    try {
      const body = await response.json();
      message = body.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (response.status === 206) {
    throw new Error("Incomplete PDF download — please try Save again.");
  }

  const expectedLength = Number(response.headers.get("Content-Length") || 0);
  const blob = await response.blob();

  if (expectedLength > 0 && blob.size < expectedLength) {
    throw new Error(
      `Download incomplete (${formatFileSize(blob.size)} of ${formatFileSize(expectedLength)}). Try again.`
    );
  }

  const saveAs = sanitizeDownloadFileName(
    parseContentDispositionFileName(response.headers.get("Content-Disposition")) || fileName
  );

  if (/\.pdf$/i.test(saveAs)) {
    const header = await blob.slice(0, 5).text();
    if (!header.startsWith("%PDF")) {
      throw new Error("Downloaded file is not a valid PDF. Try Save again.");
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = saveAs;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

/** Encode each path segment so folders with spaces (e.g. subject names) load in <video>. */
export const encodeMediaWebPath = (webPath = "") => {
  if (!webPath || !webPath.startsWith("/")) return webPath;
  const hashIndex = webPath.indexOf("#");
  const queryIndex = webPath.indexOf("?");
  const cutCandidates = [hashIndex, queryIndex].filter((index) => index >= 0);
  const cut = cutCandidates.length ? Math.min(...cutCandidates) : -1;
  const pathPart = cut >= 0 ? webPath.slice(0, cut) : webPath;
  const suffix = cut >= 0 ? webPath.slice(cut) : "";
  const encoded = pathPart
    .split("/")
    .map((segment) => (segment ? encodeURIComponent(segment) : ""))
    .join("/");
  return `${encoded}${suffix}`;
};

const buildStreamCacheApiPlayUrl = (contentId) => {
  if (!contentId) return "";
  const apiBase = getMediaApiBaseUrl();
  let url = `${apiBase}/contents/${encodeURIComponent(contentId)}/stream-cache/play`;
  try {
    const token = localStorage.getItem("cds_token");
    if (token) url += `?token=${encodeURIComponent(token)}`;
  } catch {
    // ignore storage errors
  }
  return url;
};

/** Direct disk playback when stream cache reached 100% (no Telegram needed). */
export const buildStreamCachePlayUrl = (contentId, playWebPath = null, { preferApi = false } = {}) => {
  if (preferApi) return buildStreamCacheApiPlayUrl(contentId);
  if (playWebPath?.startsWith("/uploads/")) {
    return resolveVideoPlaybackUrl(encodeMediaWebPath(playWebPath));
  }
  return buildStreamCacheApiPlayUrl(contentId);
};

/** Switch between API stream and static /uploads path when one fails. */
export const alternateStreamCachePlayUrl = (contentId, playWebPath, currentUrl = "") => {
  const direct = playWebPath?.startsWith("/uploads/")
    ? resolveVideoPlaybackUrl(encodeMediaWebPath(playWebPath))
    : "";
  const api = buildStreamCacheApiPlayUrl(contentId);
  if (currentUrl === direct && api && api !== currentUrl) return api;
  if (currentUrl === api && direct && direct !== currentUrl) return direct;
  if (currentUrl !== direct && direct) return direct;
  if (currentUrl !== api && api) return api;
  return "";
};

/** Cached YouTube download streamed through the CDS Plyr player (localhost only). */
export const buildYoutubePlaybackStreamUrl = (contentId) => {
  if (!contentId) return "";
  const apiBase = getMediaApiBaseUrl();
  let url = `${apiBase}/contents/${encodeURIComponent(contentId)}/youtube-playback/stream`;
  try {
    const token = localStorage.getItem("cds_token");
    if (token) url += `?token=${encodeURIComponent(token)}`;
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
  if (item.sourceType === "upload") {
    const filePath = item.filePath || "";
    return filePath.startsWith("/") ? filePath : toAbsoluteMediaUrl(filePath);
  }
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

/** Sum known video durations from lesson rows (seconds). */
export const sumVideoDurationSeconds = (items = []) =>
  (Array.isArray(items) ? items : []).reduce((sum, item) => {
    if (item?.type !== "video") return sum;
    const duration = Number(item.duration);
    return Number.isFinite(duration) && duration > 0 ? sum + duration : sum;
  }, 0);

/** Human-friendly total for subject headers — e.g. "28h 15m". */
export const formatTotalStudyDuration = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!safe) return "";
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours >= 1) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes >= 1) return `${minutes}m`;
  return formatDuration(safe);
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
