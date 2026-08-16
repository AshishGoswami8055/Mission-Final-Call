import fs from "node:fs";
import path from "node:path";
import Content from "../models/Content.js";
import { getPlaybackCacheDir, ensureLocalMediaDirs } from "../config/mediaStorage.js";
import { isYouTubeUrl } from "../utils/contentHelpers.js";
import { downloadYouTubeVideo, formatYoutubeBotError } from "./youtubeDownloadService.js";
import { isLocalLibraryEnabled } from "./localLibraryService.js";

/** Bump when download settings change so stale low-quality caches are replaced. */
export const YOUTUBE_PLAYBACK_CACHE_VERSION = 3;

const MIN_PLAYBACK_HEIGHT = 720;

const metaPath = (contentId) => {
  return path.join(getPlaybackCacheDir(), `${String(contentId)}_youtube.meta.json`);
};

const cachePrefix = (contentId) => `${String(contentId)}_youtube`;

const resolveCacheFile = (contentId) => {
  const dir = getPlaybackCacheDir();
  const prefix = cachePrefix(contentId);
  if (!fs.existsSync(dir)) return null;

  const match = fs
    .readdirSync(dir)
    .filter((file) => file.startsWith(prefix) && !file.endsWith(".meta.json"))
    .sort(
      (a, b) =>
        fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs
    )
    .find((file) => {
      const ext = path.extname(file).toLowerCase();
      return [".mp4", ".webm", ".mkv", ".mov"].includes(ext);
    });

  return match ? path.join(dir, match) : null;
};

const isValidFile = (absolutePath) => {
  try {
    return Boolean(absolutePath && fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 1024);
  } catch {
    return false;
  }
};

const readMeta = (contentId) => {
  const file = metaPath(contentId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

const writeMeta = (contentId, payload) => {
  ensureLocalMediaDirs();
  fs.writeFileSync(metaPath(contentId), JSON.stringify(payload, null, 2));
};

/** @type {Map<string, Promise<string>>} */
const activeJobs = new Map();

export const removeYoutubePlaybackCache = (contentId) => {
  const key = String(contentId);
  const dir = getPlaybackCacheDir();
  const prefix = cachePrefix(key);
  let removed = 0;

  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith(prefix)) {
        try {
          fs.unlinkSync(path.join(dir, file));
          removed += 1;
        } catch {
          // ignore
        }
      }
    }
  }

  activeJobs.delete(key);
  return { removed, contentId: key };
};

const isCacheCurrent = (contentId) => {
  const absolute = resolveCacheFile(contentId);
  if (!isValidFile(absolute)) return false;
  const meta = readMeta(contentId);
  if (meta?.qualityVersion !== YOUTUBE_PLAYBACK_CACHE_VERSION) return false;
  return Number(meta?.probedHeight || meta?.height || 0) >= MIN_PLAYBACK_HEIGHT;
};

export const resolveYoutubeLessonUrl = (content) => {
  if (!content || content.type !== "video") return "";
  const url = String(content.url || content.videoUrl || "").trim();
  if (!url || !isYouTubeUrl(url)) return "";
  if (content.sourceType === "cloudinary" || content.sourceType === "upload") return "";
  if (content.videoSourceType === "telegram" || content.telegramSource) return "";
  return url;
};

export const getYoutubePlaybackCacheStatus = (contentId) => {
  const absolute = resolveCacheFile(contentId);
  const meta = readMeta(contentId);
  if (isValidFile(absolute) && isCacheCurrent(contentId)) {
    return {
      ready: true,
      preparing: false,
      contentId: String(contentId),
      filePath: absolute,
      height: meta?.probedHeight ?? meta?.height ?? null,
      width: meta?.probedWidth ?? meta?.width ?? null,
      qualityVersion: meta?.qualityVersion ?? null,
    };
  }

  return {
    ready: false,
    preparing: activeJobs.has(String(contentId)),
    contentId: String(contentId),
    filePath: null,
    error: meta?.error || null,
    staleCache: isValidFile(absolute) && !isCacheCurrent(contentId),
  };
};

export const ensureYoutubePlaybackCache = async (contentId) => {
  if (!isLocalLibraryEnabled()) {
    throw new Error("CDS player for YouTube is only available on localhost.");
  }

  const key = String(contentId);
  if (isCacheCurrent(key)) {
    return resolveCacheFile(key);
  }

  if (resolveCacheFile(key)) {
    removeYoutubePlaybackCache(key);
  }

  if (activeJobs.has(key)) {
    return activeJobs.get(key);
  }

  const content = await Content.findById(contentId);
  if (!content) throw new Error("Video not found");

  const url = resolveYoutubeLessonUrl(content);
  if (!url) throw new Error("This lesson is not a YouTube link.");

  const job = (async () => {
    ensureLocalMediaDirs();
    try {
      const result = await downloadYouTubeVideo({
        url,
        titleHint: content.title || "YouTube Video",
        targetDir: getPlaybackCacheDir(),
        outputBase: `${key}_youtube`,
        qualityProfile: "max",
      });

      const resolved = result.absolutePath;
      if (!isValidFile(resolved)) {
        throw new Error("YouTube download did not produce a playable file.");
      }

      writeMeta(key, {
        contentId: key,
        sourceUrl: url,
        filePath: resolved,
        builtAt: new Date().toISOString(),
        durationSeconds: result.meta?.durationSeconds ?? content.duration ?? null,
        probedHeight: result.meta?.height ?? null,
        probedWidth: result.meta?.width ?? null,
        probedCodec: result.meta?.codec ?? null,
        height: result.meta?.height ?? null,
        width: result.meta?.width ?? null,
        qualityVersion: YOUTUBE_PLAYBACK_CACHE_VERSION,
        qualityProfile: "max",
      });

      return resolved;
    } catch (error) {
      const message = formatYoutubeBotError(error.message || "YouTube prepare failed");
      writeMeta(key, {
        contentId: key,
        sourceUrl: url,
        error: message,
        failedAt: new Date().toISOString(),
      });
      throw new Error(message);
    }
  })();

  activeJobs.set(key, job);
  try {
    return await job;
  } finally {
    activeJobs.delete(key);
  }
};
