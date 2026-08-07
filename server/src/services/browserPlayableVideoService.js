import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveFfmpegBinary } from "../utils/resolveFfmpeg.js";
import {
  ensureLocalMediaDirs,
  getLocalLibraryDir,
  getPlaybackCacheDir,
  resolveMediaAbsolutePath,
  toMediaWebPath,
} from "../config/mediaStorage.js";

const BROWSER_EXTENSIONS = new Set([".mp4", ".webm", ".m4v"]);
const REMUX_EXTENSIONS = new Set([".mkv", ".mov", ".avi", ".ts", ".m2ts"]);

/** @type {Map<string, Promise<string>>} */
const activeRemuxJobs = new Map();

const remuxMetaPath = (contentId) =>
  path.join(getPlaybackCacheDir(), `${String(contentId)}_browser.meta.json`);

const remuxOutputPath = (contentId) =>
  path.join(getPlaybackCacheDir(), `${String(contentId)}_browser.mp4`);

const remuxWebPath = (contentId) =>
  toMediaWebPath("_playback_cache", `${String(contentId)}_browser.mp4`);

const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const isValidVideoFile = (absolutePath) => {
  try {
    return Boolean(absolutePath && fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 1024);
  } catch {
    return false;
  }
};

const sourceFingerprint = (absolutePath) => {
  const stat = fs.statSync(absolutePath);
  return crypto
    .createHash("sha1")
    .update(`${absolutePath}|${stat.size}|${stat.mtimeMs}`)
    .digest("hex");
};

export const getLibraryAbsolutePath = (contentId) => {
  const meta = readJson(path.join(getLocalLibraryDir(), `${String(contentId)}.meta.json`));
  if (meta?.filePath) {
    const absolute = resolveMediaAbsolutePath(meta.filePath);
    if (isValidVideoFile(absolute)) return absolute;
  }

  const libraryDir = getLocalLibraryDir();
  if (!fs.existsSync(libraryDir)) return null;
  for (const name of fs.readdirSync(libraryDir)) {
    if (!name.startsWith(`${String(contentId)}.`) || name.endsWith(".meta.json")) continue;
    const absolute = path.join(libraryDir, name);
    if (isValidVideoFile(absolute)) return absolute;
  }
  return null;
};

export const isBrowserPlayableExtension = (ext = "") =>
  BROWSER_EXTENSIONS.has(String(ext).toLowerCase());

export const needsBrowserRemux = (absolutePath) => {
  if (!absolutePath) return false;
  return REMUX_EXTENSIONS.has(path.extname(absolutePath).toLowerCase());
};

const resolveFfmpeg = () => resolveFfmpegBinary();

const runFfmpeg = (ffmpeg, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.trim() || `ffmpeg failed with code ${code}`));
    });
  });

const remuxToMp4 = async (sourcePath, outputPath) => {
  const ffmpeg = await resolveFfmpeg();
  if (!ffmpeg) {
    throw new Error(
      "ffmpeg is not installed. Install ffmpeg (winget install ffmpeg) to auto-convert MKV files."
    );
  }

  ensureLocalMediaDirs();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const attempts = [
    ["-c", "copy"],
    ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k"],
    ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "192k"],
  ];

  let lastError = null;
  for (const codecArgs of attempts) {
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      await runFfmpeg(ffmpeg, [
        "-y",
        "-i",
        sourcePath,
        ...codecArgs,
        "-movflags",
        "+faststart",
        outputPath,
      ]);
      if (isValidVideoFile(outputPath)) return;
    } catch (error) {
      lastError = error;
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {
        /* ignore */
      }
    }
  }

  throw lastError || new Error("Could not convert video for browser playback");
};

const readValidRemuxCache = (contentId, sourcePath) => {
  const meta = readJson(remuxMetaPath(contentId));
  const output = remuxOutputPath(contentId);
  if (!meta || meta.sourceFingerprint !== sourceFingerprint(sourcePath)) return null;
  return isValidVideoFile(output) ? output : null;
};

export const invalidateBrowserPlayableCache = (contentId) => {
  try {
    fs.unlinkSync(remuxOutputPath(contentId));
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(remuxMetaPath(contentId));
  } catch {
    /* ignore */
  }
  activeRemuxJobs.delete(String(contentId));
};

export const ensureBrowserPlayableAbsolute = async (contentId) => {
  const sourcePath = getLibraryAbsolutePath(contentId);
  if (!sourcePath) {
    throw new Error("Video is not saved on your PC yet. Use Download or Replace on the lesson.");
  }

  const ext = path.extname(sourcePath).toLowerCase();
  if (isBrowserPlayableExtension(ext)) return sourcePath;

  const cached = readValidRemuxCache(contentId, sourcePath);
  if (cached) return cached;

  const key = String(contentId);
  if (activeRemuxJobs.has(key)) {
    return activeRemuxJobs.get(key);
  }

  const job = (async () => {
    const outputPath = remuxOutputPath(contentId);
    await remuxToMp4(sourcePath, outputPath);
    fs.writeFileSync(
      remuxMetaPath(contentId),
      JSON.stringify(
        {
          contentId: key,
          sourcePath,
          sourceFingerprint: sourceFingerprint(sourcePath),
          filePath: remuxWebPath(contentId),
          builtAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    return outputPath;
  })();

  activeRemuxJobs.set(key, job);
  try {
    return await job;
  } finally {
    activeRemuxJobs.delete(key);
  }
};

export const getBrowserPlayablePlayUrl = (contentId, { apiBase = "", token = null } = {}) => {
  const sourcePath = getLibraryAbsolutePath(contentId);
  if (!sourcePath) return null;

  const ext = path.extname(sourcePath).toLowerCase();
  if (isBrowserPlayableExtension(ext)) {
    const meta = readJson(path.join(getLocalLibraryDir(), `${String(contentId)}.meta.json`));
    if (meta?.filePath) return meta.filePath;
    return toMediaWebPath("_local_library", path.basename(sourcePath));
  }

  const cached = readValidRemuxCache(contentId, sourcePath);
  if (cached) return remuxWebPath(contentId);

  if (!apiBase) return null;
  let url = `${apiBase}/contents/${encodeURIComponent(contentId)}/browser-playable/stream`;
  if (token) url += `?token=${encodeURIComponent(token)}`;
  return url;
};

export const prepareBrowserPlayableBatch = (contentIds = []) => {
  const unique = [...new Set(contentIds.map(String))];
  for (const contentId of unique) {
    const sourcePath = getLibraryAbsolutePath(contentId);
    if (!sourcePath || !needsBrowserRemux(sourcePath)) continue;
    if (readValidRemuxCache(contentId, sourcePath)) continue;
    if (activeRemuxJobs.has(contentId)) continue;
    void ensureBrowserPlayableAbsolute(contentId).catch((error) => {
      console.warn(`[browser-playable] remux failed for ${contentId}:`, error.message);
    });
  }
};

export const getBrowserPlayableStatus = (contentId) => {
  const sourcePath = getLibraryAbsolutePath(contentId);
  if (!sourcePath) {
    return { ready: false, converting: false, playUrl: null, needsRemux: false };
  }

  const ext = path.extname(sourcePath).toLowerCase();
  if (isBrowserPlayableExtension(ext)) {
    const playUrl = getBrowserPlayablePlayUrl(contentId);
    return { ready: true, converting: false, playUrl, needsRemux: false, sourceExt: ext };
  }

  const cached = readValidRemuxCache(contentId, sourcePath);
  if (cached) {
    return {
      ready: true,
      converting: false,
      playUrl: remuxWebPath(contentId),
      needsRemux: true,
      sourceExt: ext,
    };
  }

  return {
    ready: false,
    converting: activeRemuxJobs.has(String(contentId)),
    playUrl: null,
    needsRemux: true,
    sourceExt: ext,
  };
};
