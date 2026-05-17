/**
 * Builds a "screenshot" image for YouTube video notes by fetching the video thumbnail
 * and drawing a timestamp overlay (browsers cannot capture pixels from the YouTube iframe).
 */

const THUMBNAIL_URLS = [
  (id) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
  (id) => `https://img.youtube.com/vi/${id}/sddefault.jpg`,
  (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
  (id) => `https://img.youtube.com/vi/${id}/default.jpg`,
];

const formatTimeForOverlay = (seconds = 0) => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

/**
 * Load an image from URL with CORS if possible.
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load thumbnail"));
    img.src = url;
  });

/**
 * Try thumbnail URLs in order until one loads.
 * @param {string} videoId
 * @returns {Promise<HTMLImageElement>}
 */
const loadYouTubeThumbnail = (videoId) => {
  if (!videoId) return Promise.reject(new Error("No video ID"));
  let lastError;
  const tryNext = (index) => {
    if (index >= THUMBNAIL_URLS.length) return Promise.reject(lastError || new Error("No thumbnail"));
    const url = THUMBNAIL_URLS[index](videoId);
    return loadImage(url).catch((err) => {
      lastError = err;
      return tryNext(index + 1);
    });
  };
  return tryNext(0);
};

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

/**
 * Produces a data URL (JPEG) for a YouTube note: thumbnail + timestamp overlay.
 * Falls back to a timestamp-only placeholder if thumbnail cannot be loaded (e.g. CORS).
 * @param {string} videoId - YouTube video ID
 * @param {number} timestampSeconds - time in seconds to show on the image
 * @returns {Promise<string>} data URL (image/jpeg)
 */
export const getYouTubeThumbnailDataUrl = async (videoId, timestampSeconds = 0) => {
  const label = formatTimeForOverlay(timestampSeconds);
  let img;
  try {
    img = await loadYouTubeThumbnail(videoId);
  } catch {
    return createPlaceholderDataUrl(label, DEFAULT_WIDTH, DEFAULT_HEIGHT);
  }
  const w = img.naturalWidth || DEFAULT_WIDTH;
  const h = img.naturalHeight || DEFAULT_HEIGHT;
  const scale = w > DEFAULT_WIDTH ? DEFAULT_WIDTH / w : 1;
  const cw = Math.floor(w * scale);
  const ch = Math.floor(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(img, 0, 0, cw, ch);

  const fontSize = Math.max(14, Math.floor(cw / 40));
  ctx.font = `bold ${fontSize}px sans-serif`;
  const textWidth = ctx.measureText(label).width;
  const pad = fontSize * 0.6;
  const boxW = textWidth + pad * 2;
  const boxH = fontSize + pad * 2;
  const x = cw - boxW - 12;
  const y = 12;

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, boxW, boxH);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + pad, y + boxH / 2);

  try {
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return createPlaceholderDataUrl(label, cw, ch);
  }
};

/**
 * Placeholder when thumbnail cannot be used (e.g. CORS). Still shows timestamp.
 */
function createPlaceholderDataUrl(label, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `bold ${Math.max(18, Math.floor(width / 35))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, width / 2, height / 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "14px sans-serif";
  ctx.fillText("YouTube note", width / 2, height / 2 + 40);
  return canvas.toDataURL("image/jpeg", 0.9);
}
