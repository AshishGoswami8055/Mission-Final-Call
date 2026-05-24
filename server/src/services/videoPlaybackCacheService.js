import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import Content from "../models/Content.js";
import { downloadTelegramMediaToFile } from "./telegramService.js";
import { isTelegramStreamContent } from "../utils/contentPlayback.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");
export const PLAYBACK_CACHE_DIR = path.join(uploadRoot, "_playback_cache");

const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_WARN_RATIO = 0.75;

export const getMaxCacheBytes = () =>
  Math.max(50 * 1024 * 1024, Number(process.env.PLAYBACK_CACHE_MAX_MB || 512) * 1024 * 1024);

export const getWarnRatio = () => {
  const n = Number(process.env.PLAYBACK_CACHE_WARN_RATIO || DEFAULT_WARN_RATIO);
  return Math.min(0.95, Math.max(0.5, n));
};

const metaPathFor = (contentId) => path.join(PLAYBACK_CACHE_DIR, `${contentId}.meta.json`);

const safeExt = (fileName = "", mimeType = "") => {
  const fromName = path.extname(String(fileName)).toLowerCase();
  if (fromName && fromName.length <= 6) return fromName;
  if (/mp4/i.test(mimeType)) return ".mp4";
  if (/webm/i.test(mimeType)) return ".webm";
  return ".mp4";
};

const readMeta = (contentId) => {
  const metaPath = metaPathFor(contentId);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
};

const writeMeta = (meta) => {
  fs.mkdirSync(PLAYBACK_CACHE_DIR, { recursive: true });
  fs.writeFileSync(metaPathFor(meta.contentId), JSON.stringify(meta, null, 2));
};

const deleteMeta = (contentId) => {
  try {
    fs.unlinkSync(metaPathFor(contentId));
  } catch {
    /* ignore */
  }
};

const dirSizeBytes = (dirPath) => {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const name of fs.readdirSync(dirPath)) {
    const full = path.join(dirPath, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) total += stat.size;
    } catch {
      /* ignore */
    }
  }
  return total;
};

export const getPlaybackCacheStorageStats = () => {
  fs.mkdirSync(PLAYBACK_CACHE_DIR, { recursive: true });
  const usedBytes = dirSizeBytes(PLAYBACK_CACHE_DIR);
  const maxBytes = getMaxCacheBytes();
  const usedPercent = maxBytes > 0 ? Math.round((usedBytes / maxBytes) * 100) : 0;
  const warnRatio = getWarnRatio();
  const warnBytes = Math.floor(maxBytes * warnRatio);
  let level = "ok";
  if (usedBytes >= maxBytes) level = "full";
  else if (usedBytes >= warnBytes) level = "warning";

  return {
    usedBytes,
    maxBytes,
    freeBytes: Math.max(0, maxBytes - usedBytes),
    usedPercent,
    warnPercent: Math.round(warnRatio * 100),
    level,
    safeLimitLabel: `${Math.round(maxBytes / (1024 * 1024))} MB`,
  };
};

/** @type {Map<string, object>} */
const activeJobs = new Map();

export const getActiveJob = (contentId) => activeJobs.get(String(contentId)) || null;

export const isCacheEligibleContent = (content) => {
  if (!content || content.type !== "video") return false;
  if (isTelegramStreamContent(content)) return true;
  if (content.sourceType === "cloudinary" && content.videoUrl) return true;
  if (content.sourceType === "upload" && content.filePath) return true;
  return false;
};

export const getPlaybackCacheStatus = (contentId) => {
  const meta = readMeta(contentId);
  const storage = getPlaybackCacheStorageStats();
  const job = getActiveJob(contentId);

  if (meta?.filePath) {
    const absolute = path.join(uploadRoot, meta.filePath.replace(/^\/uploads\/?/, ""));
    if (fs.existsSync(absolute)) {
      return {
        cached: true,
        ready: true,
        contentId: String(contentId),
        filePath: meta.filePath,
        playUrl: meta.filePath,
        sizeBytes: meta.sizeBytes || fs.statSync(absolute).size,
        downloadedAt: meta.downloadedAt,
        storage,
        job: job ? { status: job.status, percent: job.percent } : null,
      };
    }
    deleteMeta(contentId);
  }

  return {
    cached: false,
    ready: false,
    contentId: String(contentId),
    filePath: null,
    playUrl: null,
    sizeBytes: 0,
    storage,
    job: job
      ? {
          status: job.status,
          percent: job.percent,
          bytesLoaded: job.bytesLoaded,
          bytesTotal: job.bytesTotal,
          error: job.error || null,
        }
      : null,
  };
};

const evictOldestCaches = (requiredBytes = 0) => {
  const maxBytes = getMaxCacheBytes();
  let used = dirSizeBytes(PLAYBACK_CACHE_DIR);
  if (used + requiredBytes <= maxBytes) return;

  const metas = fs
    .readdirSync(PLAYBACK_CACHE_DIR)
    .filter((n) => n.endsWith(".meta.json"))
    .map((n) => readMeta(n.replace(".meta.json", "")))
    .filter(Boolean)
    .sort((a, b) => new Date(a.lastAccessAt || a.downloadedAt) - new Date(b.lastAccessAt || b.downloadedAt));

  for (const meta of metas) {
    if (used + requiredBytes <= maxBytes) break;
    removePlaybackCache(meta.contentId);
    used = dirSizeBytes(PLAYBACK_CACHE_DIR);
  }
};

export const removePlaybackCache = (contentId) => {
  const meta = readMeta(contentId);
  if (meta?.filePath) {
    const absolute = path.join(uploadRoot, meta.filePath.replace(/^\/uploads\/?/, ""));
    try {
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
    } catch {
      /* ignore */
    }
  }
  deleteMeta(contentId);
  activeJobs.delete(String(contentId));
  return getPlaybackCacheStorageStats();
};

const downloadRemoteUrlToFile = async (url, destPath, onProgress) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download video (${response.status})`);
  }
  const total = Number(response.headers.get("content-length")) || 0;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    if (onProgress) onProgress({ bytesLoaded: buf.length, bytesTotal: buf.length, percent: 100 });
    return buf.length;
  }

  let loaded = 0;
  const fileStream = fs.createWriteStream(destPath);
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      loaded += chunk.length;
      if (!fileStream.write(chunk)) {
        await new Promise((resolve) => fileStream.once("drain", resolve));
      }
      if (onProgress && total > 0) {
        onProgress({
          bytesLoaded: loaded,
          bytesTotal: total,
          percent: Math.min(99, Math.round((loaded / total) * 100)),
        });
      }
    }
    fileStream.end();
    await new Promise((resolve, reject) => {
      fileStream.once("finish", resolve);
      fileStream.once("error", reject);
    });
  } catch (error) {
    fileStream.destroy();
    try {
      fs.unlinkSync(destPath);
    } catch {
      /* ignore */
    }
    throw error;
  }

  return loaded;
};

const runDownloadJob = async (content) => {
  const contentId = String(content._id);
  const estimatedSize = Number(content.telegramFileSize || content.size || 0);
  evictOldestCaches(estimatedSize || 50 * 1024 * 1024);

  const storage = getPlaybackCacheStorageStats();
  if (storage.level === "full") {
    throw new Error("Playback cache is full. Watch a cached video to completion or wait for cleanup.");
  }

  const ext = safeExt(content.telegramFileName, content.telegramMimeType);
  const relativePath = `_playback_cache/${contentId}${ext}`;
  const destPath = path.join(PLAYBACK_CACHE_DIR, `${contentId}${ext}`);

  const job = {
    status: "downloading",
    percent: 0,
    bytesLoaded: 0,
    bytesTotal: estimatedSize,
    error: null,
  };
  activeJobs.set(contentId, job);

  const onProgress = ({ bytesLoaded, bytesTotal, percent }) => {
    job.bytesLoaded = bytesLoaded;
    job.bytesTotal = bytesTotal;
    job.percent = percent;
  };

  try {
    if (isTelegramStreamContent(content)) {
      await downloadTelegramMediaToFile({
        channelId: content.telegramChannelId,
        messageId: content.telegramMessageId,
        destPath,
        onProgress,
      });
    } else if (content.sourceType === "cloudinary" && content.videoUrl) {
      await downloadRemoteUrlToFile(content.videoUrl, destPath, onProgress);
    } else if (content.sourceType === "upload" && content.filePath) {
      const source = path.join(uploadRoot, String(content.filePath).replace(/^\/uploads\/?/, ""));
      if (!fs.existsSync(source)) throw new Error("Source video file not found on server.");
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(source, destPath);
      job.percent = 100;
    } else {
      throw new Error("This video cannot be cached for local playback.");
    }

    const sizeBytes = fs.statSync(destPath).size;
    const nextStorage = getPlaybackCacheStorageStats();
    if (nextStorage.usedBytes > getMaxCacheBytes()) {
      fs.unlinkSync(destPath);
      throw new Error("Not enough cache space for this video. Try again after other caches are cleared.");
    }

    const webPath = `/uploads/${relativePath.replace(/\\/g, "/")}`;
    writeMeta({
      contentId,
      filePath: webPath,
      sizeBytes,
      downloadedAt: new Date().toISOString(),
      lastAccessAt: new Date().toISOString(),
      title: content.title,
    });

    job.status = "ready";
    job.percent = 100;
    return getPlaybackCacheStatus(contentId);
  } catch (error) {
    job.status = "error";
    job.error = error.message || "Download failed";
    throw error;
  } finally {
    setTimeout(() => {
      if (activeJobs.get(contentId)?.status !== "downloading") {
        activeJobs.delete(contentId);
      }
    }, 30000);
  }
};

export const startPlaybackCacheDownload = async (contentId) => {
  const existing = getPlaybackCacheStatus(contentId);
  if (existing.cached && existing.ready) return existing;

  const running = getActiveJob(contentId);
  if (running?.status === "downloading") {
    return getPlaybackCacheStatus(contentId);
  }

  const content = await Content.findById(contentId);
  if (!content) throw new Error("Content not found");
  if (!isCacheEligibleContent(content)) {
    throw new Error("Only stream, Cloudinary, or uploaded videos can be cached for smooth playback.");
  }

  runDownloadJob(content).catch(() => {});
  return getPlaybackCacheStatus(contentId);
};

export const touchPlaybackCache = (contentId) => {
  const meta = readMeta(contentId);
  if (!meta) return;
  meta.lastAccessAt = new Date().toISOString();
  writeMeta(meta);
};
