export const VIDEO_FILE_EXTENSIONS =
  /\.(mp4|webm|mkv|mov|m4v|avi|ts|3gp|flv|wmv|mpeg|mpg|m2ts)$/i;

/** Classify Telegram document/native-video payloads as importable video or PDF. */
export const classifyTelegramMediaType = ({
  mimeType = "",
  fileName = "",
  hasVideoAttribute = false,
} = {}) => {
  const mime = String(mimeType).toLowerCase();
  const name = String(fileName || "");

  const isVideo =
    mime.startsWith("video/") || VIDEO_FILE_EXTENSIONS.test(name) || Boolean(hasVideoAttribute);
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name);

  if (isVideo) return "video";
  if (isPdf) return "pdf";
  return null;
};
