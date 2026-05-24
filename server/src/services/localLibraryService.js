import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Content from "../models/Content.js";
import { downloadTelegramMediaToFile } from "./telegramService.js";
import { isTelegramStreamContent } from "../utils/contentPlayback.js";
import { isCacheEligibleContent } from "./videoPlaybackCacheService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");
export const LOCAL_LIBRARY_DIR = path.join(uploadRoot, "_local_library");

/** PC library only — disabled on production Render unless explicitly enabled. */
export const isLocalLibraryEnabled = () =>
  process.env.NODE_ENV !== "production" || String(process.env.LOCAL_LIBRARY_ENABLED || "") === "1";

export const getMaxLibraryBytes = () => {
  const mb = Number(process.env.LOCAL_LIBRARY_MAX_MB || 102400);
  if (mb <= 0) return 0;
  return Math.max(1024 * 1024 * 1024, mb * 1024 * 1024);
};

const getWarnRatio = () => {
  const n = Number(process.env.LOCAL_LIBRARY_WARN_RATIO || 0.8);
  return Math.min(0.95, Math.max(0.5, n));
};

const metaPathFor = (contentId) => path.join(LOCAL_LIBRARY_DIR, `${contentId}.meta.json`);

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
  fs.mkdirSync(LOCAL_LIBRARY_DIR, { recursive: true });
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

export const getLocalLibraryStorageStats = () => {
  fs.mkdirSync(LOCAL_LIBRARY_DIR, { recursive: true });
  const usedBytes = dirSizeBytes(LOCAL_LIBRARY_DIR);
  const maxBytes = getMaxLibraryBytes();
  const usedPercent = maxBytes > 0 ? Math.round((usedBytes / maxBytes) * 100) : 0;
  const warnRatio = getWarnRatio();
  const warnBytes = maxBytes > 0 ? Math.floor(maxBytes * warnRatio) : 0;
  let level = "ok";
  if (maxBytes > 0 && usedBytes >= maxBytes) level = "full";
  else if (maxBytes > 0 && usedBytes >= warnBytes) level = "warning";

  return {
    usedBytes,
    maxBytes,
    freeBytes: maxBytes > 0 ? Math.max(0, maxBytes - usedBytes) : null,
    usedPercent: maxBytes > 0 ? usedPercent : 0,
    warnPercent: Math.round(warnRatio * 100),
    level,
    unlimited: maxBytes <= 0,
    locationLabel: LOCAL_LIBRARY_DIR,
  };
};

/** @type {Map<string, object>} */
const activeJobs = new Map();

/** @type {Map<string, object>} */
const subjectBulkJobs = new Map();

const getActiveJob = (contentId) => activeJobs.get(String(contentId)) || null;

export const getLocalLibraryStatus = (contentId) => {
  const meta = readMeta(contentId);
  const storage = getLocalLibraryStorageStats();
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
        title: meta.title,
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

const downloadRemoteUrlToFile = async (url, destPath, onProgress) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download video (${response.status})`);
  const total = Number(response.headers.get("content-length")) || 0;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    onProgress?.({ bytesLoaded: buf.length, bytesTotal: buf.length, percent: 100 });
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
  const ext = safeExt(content.telegramFileName, content.telegramMimeType);
  const fileName = `${contentId}${ext}`;
  const destPath = path.join(LOCAL_LIBRARY_DIR, fileName);
  const webPath = `/uploads/_local_library/${fileName}`;

  const job = {
    status: "downloading",
    percent: 0,
    bytesLoaded: 0,
    bytesTotal: Number(content.telegramFileSize || content.size || 0),
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
      if (!fs.existsSync(source)) throw new Error("Source video file not found.");
      fs.mkdirSync(LOCAL_LIBRARY_DIR, { recursive: true });
      fs.copyFileSync(source, destPath);
      job.percent = 100;
    } else {
      throw new Error("This video cannot be saved to the PC library.");
    }

    const sizeBytes = fs.statSync(destPath).size;
    const maxBytes = getMaxLibraryBytes();
    if (maxBytes > 0 && sizeBytes > maxBytes) {
      fs.unlinkSync(destPath);
      throw new Error("Video exceeds PC library size limit.");
    }

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
    return getLocalLibraryStatus(contentId);
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

export const downloadContentToLibrary = async (content) => {
  if (!isLocalLibraryEnabled()) {
    throw new Error("PC library is only available on the local study server.");
  }
  if (!content || !isCacheEligibleContent(content)) {
    throw new Error("This video type cannot be saved to the PC library.");
  }

  const contentId = String(content._id);
  const existing = getLocalLibraryStatus(contentId);
  if (existing.cached && existing.ready) return existing;

  const running = getActiveJob(contentId);
  if (running?.status === "downloading") {
    await waitForContentJob(contentId);
    return getLocalLibraryStatus(contentId);
  }

  await runDownloadJob(content);
  return getLocalLibraryStatus(contentId);
};

const waitForContentJob = (contentId, timeoutMs = 6 * 60 * 60 * 1000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const job = getActiveJob(contentId);
      if (!job || job.status === "ready") {
        resolve(getLocalLibraryStatus(contentId));
        return;
      }
      if (job.status === "error") {
        reject(new Error(job.error || "Download failed"));
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Download timed out"));
        return;
      }
      setTimeout(tick, 1500);
    };
    tick();
  });

export const startLocalLibraryDownload = async (contentId) => {
  if (!isLocalLibraryEnabled()) {
    throw new Error("PC library is only available on the local study server.");
  }

  const existing = getLocalLibraryStatus(contentId);
  if (existing.cached && existing.ready) return existing;

  const running = getActiveJob(contentId);
  if (running?.status === "downloading") return getLocalLibraryStatus(contentId);

  const content = await Content.findById(contentId);
  if (!content) throw new Error("Content not found");
  if (!isCacheEligibleContent(content)) {
    throw new Error("This video type cannot be saved to the PC library.");
  }

  runDownloadJob(content).catch(() => {});
  return getLocalLibraryStatus(contentId);
};

const runSubjectBulkJob = async (subjectId, videos) => {
  const key = String(subjectId);
  const job = subjectBulkJobs.get(key);
  if (!job) return;

  job.status = "downloading";
  for (const content of videos) {
    const item = job.items.find((row) => row.contentId === String(content._id));
    if (!item) continue;

    const existing = getLocalLibraryStatus(content._id);
    if (existing.cached && existing.ready) {
      item.status = "ready";
      job.skipped += 1;
      job.completed += 1;
      continue;
    }

    item.status = "downloading";
    job.currentTitle = content.title;
    job.currentPercent = 0;

    const progressInterval = setInterval(() => {
      const active = getActiveJob(content._id);
      if (active?.status === "downloading") {
        job.currentPercent = active.percent ?? 0;
        item.percent = active.percent ?? 0;
      }
    }, 1000);

    try {
      await downloadContentToLibrary(content);
      item.status = "ready";
      item.percent = 100;
      job.completed += 1;
    } catch (error) {
      item.status = "error";
      item.error = error.message || "Download failed";
      job.failed += 1;
    } finally {
      clearInterval(progressInterval);
    }
  }

  job.status = job.failed > 0 && job.completed === job.skipped ? "error" : "done";
  job.finishedAt = new Date().toISOString();
  job.currentTitle = null;
  job.currentPercent = 100;
};

export const startSubjectLocalLibraryDownload = async (subjectId, videos) => {
  if (!isLocalLibraryEnabled()) {
    throw new Error("PC library is only available on the local study server.");
  }

  const key = String(subjectId);
  const running = subjectBulkJobs.get(key);
  if (running?.status === "downloading") return getSubjectLocalLibraryStatus(subjectId);

  const job = {
    subjectId: key,
    status: "queued",
    total: videos.length,
    completed: 0,
    skipped: 0,
    failed: 0,
    currentTitle: null,
    currentPercent: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    items: videos.map((content) => ({
      contentId: String(content._id),
      title: content.title,
      status: "pending",
      percent: 0,
      error: null,
    })),
    storage: getLocalLibraryStorageStats(),
  };

  subjectBulkJobs.set(key, job);
  runSubjectBulkJob(subjectId, videos).catch(() => {});
  return getSubjectLocalLibraryStatus(subjectId);
};

export const getSubjectLocalLibraryStatus = (subjectId) => {
  const key = String(subjectId);
  const job = subjectBulkJobs.get(key);
  const storage = getLocalLibraryStorageStats();

  if (!job) {
    return {
      subjectId: key,
      status: "idle",
      total: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      percent: 0,
      storage,
      items: [],
    };
  }

  const doneCount = job.items.filter((item) => item.status === "ready" || item.status === "error").length;
  const percent = job.total ? Math.round((doneCount / job.total) * 100) : 0;

  return {
    ...job,
    percent,
    storage,
  };
};

export const removeLocalLibraryFile = (contentId) => {
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
  return getLocalLibraryStorageStats();
};

export const resolveLocalLibraryPlayUrl = (contentId) => {
  if (!isLocalLibraryEnabled()) return null;
  const status = getLocalLibraryStatus(contentId);
  return status.ready ? status.playUrl : null;
};

export { isCacheEligibleContent as isLocalLibraryEligibleContent };
