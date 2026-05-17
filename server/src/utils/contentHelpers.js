const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"];
const PDF_EXTENSIONS = [".pdf"];

export const isYouTubeUrl = (input = "") =>
  /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i.test(input);

export const isTelegramUrl = (input = "") =>
  /^https?:\/\/(?:t\.me|telegram\.me)\//i.test(String(input || "").trim()) ||
  /^tg:\/\//i.test(String(input || "").trim());

export const getYouTubeThumbnail = (url = "") => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (!match?.[1]) return null;
  return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
};

export const detectTypeFromUrl = (url = "") => {
  const cleaned = url.split("?")[0].toLowerCase();
  if (
    isYouTubeUrl(url) ||
    isTelegramUrl(url) ||
    VIDEO_EXTENSIONS.some((ext) => cleaned.endsWith(ext))
  ) {
    return "video";
  }
  if (PDF_EXTENSIONS.some((ext) => cleaned.endsWith(ext))) {
    return "pdf";
  }
  return null;
};

export const detectTypeFromMime = (mimetype = "") => {
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype === "application/pdf") return "pdf";
  return null;
};

const TRAILING_DATE_RE = /\s(\d{4}-\d{1,2}-\d{1,2})\s*$/;

/**
 * Derive chapter name + content title from a filename like
 * "BUDDHISM AND JAINISM 2025-12-16.mkv" → chapter/title "BUDDHISM AND JAINISM".
 */
/** Normalize and apply a Telegram lesson link onto a content document payload. */
export const applyTelegramVideoLink = (doc, rawLink) => {
  const link = String(rawLink || "").trim();
  if (!isTelegramUrl(link)) {
    throw new Error("Use a valid Telegram link (https://t.me/... or https://telegram.me/...).");
  }
  doc.type = "video";
  doc.sourceType = "url";
  doc.videoSourceType = "telegram";
  doc.videoUrl = link;
  doc.url = link;
  doc.filePath = null;
  return doc;
};

export const parseChapterAndTitleFromFilename = (originalname = "") => {
  const ext = String(originalname).match(/\.[^.]+$/)?.[0] || "";
  let base = String(originalname || "video").replace(ext, "").trim();
  base = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

  let chapterName = base;
  const dateMatch = base.match(TRAILING_DATE_RE);
  if (dateMatch) {
    chapterName = base.slice(0, dateMatch.index).trim();
  }

  chapterName = chapterName.replace(/\s+/g, " ").trim() || "Untitled";
  return { chapterName, title: chapterName };
};
