import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Content from "../models/Content.js";
import Subject from "../models/Subject.js";
import { isTelegramStreamContent } from "../utils/contentPlayback.js";
import { buildContentDownloadItem } from "./subjectDownloadService.js";
import { downloadTelegramMediaToFile } from "./telegramService.js";
import {
  getBrowserPlayablePlayUrl,
  prepareBrowserPlayableBatch,
} from "./browserPlayableVideoService.js";
import {
  completeProgress,
  failProgress,
  initProgress,
  setProgress,
} from "./uploadProgressBus.js";

import {
  ensureLocalMediaDirs,
  getLocalLibraryDir,
  getMergedPartsDir,
  getMergedSubjectsDir,
  getPlaybackCacheDir,
  resolveMediaAbsolutePath,
  toMediaWebPath,
} from "../config/mediaStorage.js";

const DOWNLOAD_CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(process.env.MERGE_DOWNLOAD_CONCURRENCY || 3))
);

const sortSubjectVideos = (videos = []) =>
  [...videos].sort((a, b) => {
    const aSort = a.importSortOrder;
    const bSort = b.importSortOrder;
    if (aSort != null && bSort != null && aSort !== bSort) return aSort - bSort;
    if (aSort != null && bSort == null) return -1;
    if (aSort == null && bSort != null) return 1;
    const aMsg = Number(a.telegramMessageId) || 0;
    const bMsg = Number(b.telegramMessageId) || 0;
    if (aMsg && bMsg && aMsg !== bMsg) return aMsg - bMsg;
    return String(a.title).localeCompare(String(b.title));
  });

export const isMergeEligibleVideo = (content) =>
  Boolean(content && content.type === "video" && buildContentDownloadItem(content, { apiBase: "", token: null }));

export const getSortedMergeableVideos = async (subjectId) => {
  const subject = await Subject.findById(subjectId).lean();
  if (!subject) return null;
  const videos = await Content.find({ subjectId, type: "video" }).lean();
  const mergeable = sortSubjectVideos(videos).filter(isMergeEligibleVideo);
  return { subject, videos: mergeable };
};

const cacheKeyForVideos = (videos) =>
  crypto
    .createHash("sha1")
    .update(videos.map((v) => `${v._id}:${v.updatedAt || v.createdAt}`).join("|"))
    .digest("hex")
    .slice(0, 16);

const partRevision = (content) => String(new Date(content.updatedAt || content.createdAt || 0).getTime());

const partPathForVideo = (content, index) => {
  const order = String(index + 1).padStart(3, "0");
  return path.join(getMergedPartsDir(), `${order}_${content._id}_${partRevision(content)}.mp4`);
};

const metaPathFor = (subjectId) => path.join(getMergedSubjectsDir(), `${subjectId}.meta.json`);

const readMergeMeta = (subjectId) => {
  const metaPath = metaPathFor(subjectId);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
};

const writeMergeMeta = (meta) => {
  ensureLocalMediaDirs();
  fs.writeFileSync(metaPathFor(meta.subjectId), JSON.stringify(meta, null, 2));
};

const readJsonMeta = (metaPath) => {
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
};

const absoluteFromWebPath = (webPath) => resolveMediaAbsolutePath(webPath);

const resolveLibraryPath = (contentId) => {
  const meta = readJsonMeta(path.join(getLocalLibraryDir(), `${contentId}.meta.json`));
  if (meta?.filePath) {
    const absolute = absoluteFromWebPath(meta.filePath);
    if (isValidVideoFile(absolute)) return absolute;
  }

  const libraryDir = getLocalLibraryDir();
  if (fs.existsSync(libraryDir)) {
    for (const name of fs.readdirSync(libraryDir)) {
      if (!name.startsWith(`${String(contentId)}.`) || name.endsWith(".meta.json")) continue;
      const absolute = path.join(libraryDir, name);
      if (isValidVideoFile(absolute)) return absolute;
    }
  }

  return null;
};

const resolvePlaybackCachePath = (contentId) => {
  const meta = readJsonMeta(path.join(getPlaybackCacheDir(), `${contentId}.meta.json`));
  if (!meta?.filePath) return null;
  const absolute = absoluteFromWebPath(meta.filePath);
  return isValidVideoFile(absolute) ? absolute : null;
};

const isValidVideoFile = (absolutePath) => {
  try {
    return Boolean(absolutePath && fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 1024);
  } catch {
    return false;
  }
};

const resolveUploadPath = (content) => {
  if (content.sourceType !== "upload" || !content.filePath) return null;
  const absolute = absoluteFromWebPath(content.filePath);
  return isValidVideoFile(absolute) ? absolute : null;
};

/** Reuse an already-downloaded file instead of fetching again from Telegram/cloud. */
const resolveExistingVideoFile = (content) =>
  resolveLibraryPath(String(content._id)) ||
  resolvePlaybackCachePath(String(content._id)) ||
  resolveUploadPath(content);

const linkOrCopyPart = (sourcePath, destPath) => {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (fs.existsSync(destPath)) return;
  try {
    fs.linkSync(sourcePath, destPath);
  } catch {
    fs.copyFileSync(sourcePath, destPath);
  }
};

const downloadRemoteUrlToFile = async (url, destPath) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download video (${response.status})`);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buf);
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

const downloadPartToFile = async (content, destPath) => {
  if (content.sourceType === "cloudinary" && content.videoUrl) {
    await downloadRemoteUrlToFile(content.videoUrl, destPath);
    return;
  }
  if (isTelegramStreamContent(content)) {
    await downloadTelegramMediaToFile({
      channelId: content.telegramChannelId,
      messageId: content.telegramMessageId,
      destPath,
    });
    return;
  }
  if (content.sourceType === "upload" && content.filePath) {
    const source = resolveUploadPath(content);
    if (!source) throw new Error(`Missing file for "${content.title}"`);
    linkOrCopyPart(source, destPath);
    return;
  }
  throw new Error(`Cannot download "${content.title}"`);
};

const materializePart = async (content, destPath) => {
  if (isValidVideoFile(destPath)) return destPath;

  const existing = resolveExistingVideoFile(content);
  if (existing) {
    linkOrCopyPart(existing, destPath);
    return destPath;
  }

  await downloadPartToFile(content, destPath);
  if (!isValidVideoFile(destPath)) {
    throw new Error(`Download failed for "${content.title}"`);
  }
  return destPath;
};

/** Best on-disk file for merge: PC library → playback cache → upload → merge parts folder. */
const resolveMergeSourcePath = (content, index) => {
  const fromLibrary = resolveExistingVideoFile(content);
  if (fromLibrary) return fromLibrary;

  const partPath = partPathForVideo(content, index);
  return isValidVideoFile(partPath) ? partPath : null;
};

const countReadyParts = (videos) => {
  let ready = 0;
  for (let index = 0; index < videos.length; index += 1) {
    if (resolveMergeSourcePath(videos[index], index)) ready += 1;
  }
  return ready;
};

const countPcLibraryParts = (videos) => {
  let ready = 0;
  for (const video of videos) {
    if (resolveLibraryPath(String(video._id))) ready += 1;
  }
  return ready;
};

const runWithConcurrency = async (tasks, concurrency) => {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < tasks.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await tasks[current]();
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
};

export const getSubjectMergedVideoStatus = async (subjectId) => {
  const pack = await getSortedMergeableVideos(subjectId);
  if (!pack) return null;
  const cacheKey = cacheKeyForVideos(pack.videos);
  const meta = readMergeMeta(String(subjectId));
  const valid =
    meta?.cacheKey === cacheKey &&
    meta?.filePath &&
    fs.existsSync(absoluteFromWebPath(meta.filePath));

  const partsReady = countReadyParts(pack.videos);
  const partsTotal = pack.videos.length;
  const partsComplete = partsTotal > 0 && partsReady === partsTotal;
  const pcLibraryReady = countPcLibraryParts(pack.videos);

  const totalDurationSeconds = pack.videos.reduce(
    (sum, video) => sum + (Number(video.duration) || 0),
    0
  );

  return {
    subjectId: String(subjectId),
    subjectName: pack.subject.name,
    videoCount: partsTotal,
    mergeableCount: partsTotal,
    totalDurationSeconds,
    partsReady,
    partsTotal,
    partsComplete,
    pcLibraryReady,
    ready: valid,
    filePath: valid ? meta.filePath : null,
    sizeBytes: valid ? meta.sizeBytes || 0 : 0,
    builtAt: valid ? meta.builtAt : null,
    cacheKey,
  };
};

const resolveChapterPlayUrl = (content, { apiBase = "", token = null } = {}) => {
  const browserPlayUrl = getBrowserPlayablePlayUrl(String(content._id), { apiBase, token });
  if (browserPlayUrl) {
    return {
      playUrl: browserPlayUrl,
      source: browserPlayUrl.includes("/browser-playable/")
        ? "local_library_remux"
        : "local_library",
    };
  }

  const cacheMeta = readJsonMeta(path.join(getPlaybackCacheDir(), `${content._id}.meta.json`));
  if (cacheMeta?.filePath) {
    const absolute = absoluteFromWebPath(cacheMeta.filePath);
    if (isValidVideoFile(absolute)) {
      return { playUrl: cacheMeta.filePath, source: "playback_cache" };
    }
  }

  if (content.sourceType === "upload" && content.filePath) {
    const webPath = content.filePath.startsWith("/")
      ? content.filePath
      : toMediaWebPath("", content.filePath.replace(/^\/uploads\/?/, ""));
    const absolute = absoluteFromWebPath(webPath);
    if (isValidVideoFile(absolute)) {
      return { playUrl: webPath, source: "upload" };
    }
  }

  if (content.sourceType === "cloudinary" && content.videoUrl) {
    return { playUrl: content.videoUrl, source: "cloudinary" };
  }

  if (isTelegramStreamContent(content) && apiBase) {
    let playUrl = `${apiBase}/telegram/stream/${encodeURIComponent(content.telegramMessageId)}?channelId=${encodeURIComponent(content.telegramChannelId)}`;
    if (token) playUrl += `&token=${encodeURIComponent(token)}`;
    return { playUrl, source: "telegram" };
  }

  return { playUrl: null, source: null };
};

/** Ordered chapter list for instant virtual playback (no ffmpeg merge). */
export const getSubjectFullVideoPlaylist = async (subjectId, options = {}) => {
  const pack = await getSortedMergeableVideos(subjectId);
  if (!pack) return null;

  const chapters = pack.videos.map((video, index) => {
    const { playUrl, source } = resolveChapterPlayUrl(video, options);
    const onDisk = Boolean(resolveMergeSourcePath(video, index));
    return {
      contentId: String(video._id),
      title: video.title,
      order: index + 1,
      durationSeconds: Number(video.duration) || 0,
      playUrl,
      source,
      onDisk,
      onPcLibrary: Boolean(resolveLibraryPath(String(video._id))),
      browserPlayable: Boolean(playUrl),
    };
  });

  prepareBrowserPlayableBatch(
    chapters.filter((chapter) => chapter.source === "local_library_remux").map((chapter) => chapter.contentId)
  );

  const partsTotal = chapters.length;
  const partsReady = chapters.filter((chapter) => chapter.onDisk).length;
  const playableCount = chapters.filter((chapter) => chapter.playUrl).length;
  const browserPlayableCount = chapters.filter((chapter) => chapter.browserPlayable).length;

  return {
    subjectId: String(subjectId),
    subjectName: pack.subject.name,
    chapters,
    partsTotal,
    partsReady,
    playableCount,
    browserPlayableCount,
    canPlayInstantly: partsTotal > 0 && playableCount === partsTotal,
    allBrowserPlayable: partsTotal > 0 && browserPlayableCount === partsTotal,
    totalDurationSeconds: chapters.reduce((sum, chapter) => sum + chapter.durationSeconds, 0),
  };
};

const resolveFfmpeg = async () => {
  const { spawn: spawnProbe } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawnProbe(process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg", ["-version"], {
      stdio: "ignore",
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? (process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg") : null));
  });
};

const formatConcatListLine = (absolutePath) => {
  const normalized = path.resolve(absolutePath).replace(/\\/g, "/");
  return `file '${normalized.replace(/'/g, "'\\''")}'`;
};

const writeConcatListFile = (partPaths, listPath) => {
  const listBody = partPaths.map((p) => formatConcatListLine(p)).join("\n");
  fs.writeFileSync(listPath, listBody, "utf8");
};

const parseFfmpegTimeSeconds = (stderr = "") => {
  const matches = [...String(stderr).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  const hours = Number(last[1]) || 0;
  const mins = Number(last[2]) || 0;
  const secs = Number(last[3]) || 0;
  return hours * 3600 + mins * 60 + secs;
};

const runFfmpeg = (ffmpeg, args, { onStderr } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onStderr?.(text, stderr);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.trim() || `ffmpeg failed with code ${code}`));
    });
  });

const runFfmpegConcat = (ffmpeg, listPath, outputPath, extraArgs = []) =>
  runFfmpeg(ffmpeg, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    ...extraArgs,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

const runFfmpegReencode = (ffmpeg, listPath, outputPath, { onStderr, totalDurationSeconds = 0 } = {}) =>
  runFfmpeg(
    ffmpeg,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    {
      onStderr: (text, stderr) => {
        onStderr?.(text, stderr);
        if (!totalDurationSeconds) return;
        const elapsed = parseFfmpegTimeSeconds(stderr);
        if (elapsed == null) return;
        onStderr?.(text, stderr, Math.min(99, Math.round((elapsed / totalDurationSeconds) * 100)));
      },
    }
  );

const stitchWithFfmpeg = async (ffmpeg, listPath, outputPath, { uploadId, totalDurationSeconds = 0 } = {}) => {
  const attempts = [
    { label: "Fast stitch (copy)…", args: [] },
    { label: "Stitching with timestamp fix…", args: ["-fflags", "+genpts", "-avoid_negative_ts", "make_zero"] },
    { label: "Stitching with audio fix…", args: ["-bsf:a", "aac_adtstoasc", "-fflags", "+genpts"] },
  ];

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (uploadId) {
      setProgress(uploadId, {
        phase: "stitching",
        percent: 88 + index,
        message: attempt.label,
      });
    }
    try {
      await runFfmpegConcat(ffmpeg, listPath, outputPath, attempt.args);
      return;
    } catch (error) {
      if (index === attempts.length - 1) {
        console.warn("[subject-merge] concat copy failed, falling back to re-encode:", error.message?.slice(0, 200));
      }
    }
  }

  if (uploadId) {
    setProgress(uploadId, {
      phase: "stitching",
      percent: 92,
      message: "Re-encoding for compatibility (slow — use matching MP4 files next time)…",
    });
  }

  if (String(process.env.MERGE_ALLOW_REENCODE || "").trim() !== "1") {
    throw new Error(
      "Fast stitch failed — chapters may use different video formats. Use Replace on each lesson to link matching MP4 files from your PC, then try Download full video again. To allow slow re-encoding, set MERGE_ALLOW_REENCODE=1 in server .env"
    );
  }

  await runFfmpegReencode(ffmpeg, listPath, outputPath, {
    totalDurationSeconds,
    onStderr: (_text, _stderr, stitchPercent) => {
      if (!uploadId || stitchPercent == null) return;
      setProgress(uploadId, {
        phase: "stitching",
        percent: Math.max(92, Math.min(99, 92 + Math.round(stitchPercent * 0.07))),
        message: `Re-encoding… ${stitchPercent}%`,
      });
    },
  });
};

/** Phase 1 — download all chapter files in parallel (reuses PC library / cache when available). */
export const downloadSubjectMergeParts = async (subjectId, uploadId = null) => {
  const pack = await getSortedMergeableVideos(subjectId);
  if (!pack) throw new Error("Subject not found");
  if (!pack.videos.length) {
    throw new Error("No downloadable videos in this subject to merge.");
  }

  fs.mkdirSync(getMergedPartsDir(), { recursive: true });

  const partsTotal = pack.videos.length;
  const alreadyReady = countReadyParts(pack.videos);
  if (alreadyReady === partsTotal) {
    if (uploadId) {
      completeProgress(uploadId, {
        phase: "downloading",
        percent: 85,
        message: `All ${partsTotal} chapters ready on disk`,
        filesTotal: partsTotal,
        fileIndex: partsTotal,
      });
    }
    return getSubjectMergedVideoStatus(subjectId);
  }

  if (uploadId) {
    initProgress(uploadId, {
      phase: "downloading",
      percent: Math.round((alreadyReady / partsTotal) * 85),
      message: `Downloading chapters (${alreadyReady}/${partsTotal} ready)…`,
      filesTotal: partsTotal,
      fileIndex: alreadyReady,
    });
  }

  let finished = 0;
  const reportDownloadProgress = (video) => {
    finished += 1;
    if (!uploadId) return;
    setProgress(uploadId, {
      phase: "downloading",
      percent: Math.min(85, Math.round((finished / partsTotal) * 85)),
      message: `Downloaded ${finished} of ${partsTotal} chapters`,
      currentFile: video.title,
      fileIndex: finished,
      filesTotal: partsTotal,
    });
  };

  const tasks = pack.videos.map((video, index) => async () => {
    const existing = resolveMergeSourcePath(video, index);
    if (existing) {
      reportDownloadProgress(video);
      return existing;
    }

    const partPath = partPathForVideo(video, index);
    await materializePart(video, partPath);
    reportDownloadProgress(video);
    return partPath;
  });

  await runWithConcurrency(tasks, DOWNLOAD_CONCURRENCY);

  const status = await getSubjectMergedVideoStatus(subjectId);
  if (!status?.partsComplete) {
    throw new Error("Some chapters could not be downloaded.");
  }

  if (uploadId) {
    completeProgress(uploadId, {
      phase: "downloading",
      percent: 85,
      message: `All ${partsTotal} chapters downloaded — ready to stitch`,
      filesTotal: partsTotal,
      fileIndex: partsTotal,
    });
  }

  return status;
};

/** Phase 2 — ffmpeg stitch only (usually a few minutes once parts exist). */
export const stitchSubjectMergedVideo = async (subjectId, uploadId = null) => {
  const pack = await getSortedMergeableVideos(subjectId);
  if (!pack) throw new Error("Subject not found");
  if (!pack.videos.length) {
    throw new Error("No downloadable videos in this subject to merge.");
  }

  const cacheKey = cacheKeyForVideos(pack.videos);
  const existing = await getSubjectMergedVideoStatus(subjectId);
  if (existing?.ready) {
    if (uploadId) {
      completeProgress(uploadId, {
        phase: "done",
        percent: 100,
        message: "Full subject video is ready",
      });
    }
    return existing;
  }

  if (!existing?.partsComplete) {
    throw new Error("Download all chapters first before stitching.");
  }

  const ffmpeg = await resolveFfmpeg();
  if (!ffmpeg) {
    throw new Error(
      "ffmpeg is not installed. Install ffmpeg to build the full subject video."
    );
  }

  const partPaths = pack.videos.map((video, index) => {
    const sourcePath = resolveMergeSourcePath(video, index);
    if (!sourcePath) {
      throw new Error(`Missing chapter file for "${video.title}". Download it first.`);
    }
    return sourcePath;
  });

  if (uploadId) {
    setProgress(uploadId, {
      phase: "stitching",
      percent: 88,
      message: "Stitching chapters into one video…",
      filesTotal: pack.videos.length,
    });
  }

  const listPath = path.join(getMergedSubjectsDir(), `_concat_${subjectId}_${Date.now()}.txt`);
  writeConcatListFile(partPaths, listPath);

  ensureLocalMediaDirs();
  const safeName = String(pack.subject.name || "subject")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim();
  const fileName = `${safeName}_full_course.mp4`;
  const absoluteOut = path.join(getMergedSubjectsDir(), `${subjectId}_${cacheKey}.mp4`);
  const webPath = toMediaWebPath("_merged_subjects", `${subjectId}_${cacheKey}.mp4`);
  const totalDurationSeconds = pack.videos.reduce(
    (sum, video) => sum + (Number(video.duration) || 0),
    0
  );

  try {
    await stitchWithFfmpeg(ffmpeg, listPath, absoluteOut, { uploadId, totalDurationSeconds });

    const sizeBytes = fs.statSync(absoluteOut).size;
    writeMergeMeta({
      subjectId: String(subjectId),
      subjectName: pack.subject.name,
      cacheKey,
      filePath: webPath,
      fileName,
      sizeBytes,
      videoCount: pack.videos.length,
      builtAt: new Date().toISOString(),
    });

    if (uploadId) {
      completeProgress(uploadId, {
        phase: "done",
        percent: 100,
        message: "Full subject video ready",
      });
    }

    return getSubjectMergedVideoStatus(subjectId);
  } finally {
    try {
      fs.unlinkSync(listPath);
    } catch {
      /* ignore */
    }
  }
};

export const buildSubjectMergedVideo = async (subjectId, uploadId = null) => {
  const existing = await getSubjectMergedVideoStatus(subjectId);
  if (existing?.ready) {
    if (uploadId) {
      completeProgress(uploadId, {
        phase: "done",
        percent: 100,
        message: "Full subject video is ready",
      });
    }
    return existing;
  }

  await downloadSubjectMergeParts(subjectId, uploadId);
  return stitchSubjectMergedVideo(subjectId, uploadId);
};

export const getMergedVideoAbsolutePath = async (subjectId) => {
  const status = await getSubjectMergedVideoStatus(subjectId);
  if (!status?.ready || !status.filePath) return null;
  return absoluteFromWebPath(status.filePath);
};

export const getMergedVideoDownloadName = async (subjectId) => {
  const meta = readMergeMeta(String(subjectId));
  if (meta?.fileName) return meta.fileName;
  const pack = await getSortedMergeableVideos(subjectId);
  const safeName = String(pack?.subject?.name || "subject")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim();
  return `${safeName}_full_course.mp4`;
};

/** Drop stitched full-course file when a chapter file changes on disk. */
export const invalidateSubjectMergedVideo = (subjectId) => {
  const meta = readMergeMeta(String(subjectId));
  if (meta?.filePath) {
    try {
      const absolute = absoluteFromWebPath(meta.filePath);
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
    } catch {
      /* ignore */
    }
  }
  try {
    fs.unlinkSync(metaPathFor(String(subjectId)));
  } catch {
    /* ignore */
  }
};
