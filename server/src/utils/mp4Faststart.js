import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveFfmpegBinary } from "./resolveFfmpeg.js";

const jobs = new Map();
const failed = new Map();
const remuxEpoch = new Map();
const FAIL_RETRY_MS = 5 * 60 * 1000;

const readHeader = (fd, offset) => {
  const buf = Buffer.alloc(16);
  const bytes = fs.readSync(fd, buf, 0, 16, offset);
  if (bytes < 8) return null;
  let size = buf.readUInt32BE(0);
  const type = buf.slice(4, 8).toString("ascii");
  let header = 8;
  if (size === 1) {
    if (bytes < 16) return null;
    header = 16;
    size = Number(buf.readBigUInt64BE(8));
  } else if (size === 0) {
    const stat = fs.fstatSync(fd);
    size = stat.size - offset;
  }
  if (!size || size < header) return null;
  return { size, type, header };
};

/** Walk MP4 boxes. `hasMoov` is false for empty, truncated, or non-MP4 files (e.g. MKV). */
export const inspectMp4Layout = (filePath) => {
  const result = { hasMoov: false, moovBeforeMdat: false, needsFaststart: false };
  if (!filePath || !fs.existsSync(filePath)) return result;
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;
    if (size < 16) return result;
    const probe = Buffer.alloc(8);
    fs.readSync(fd, probe, 0, 8, 0);
    const brand = probe.slice(4, 8).toString("ascii");
    if (brand !== "ftyp" && brand !== "moov") return result;

    let offset = 0;
    let seenMdat = false;
    while (offset + 8 <= size) {
      const box = readHeader(fd, offset);
      if (!box) break;
      if (box.type === "mdat") seenMdat = true;
      if (box.type === "moov") {
        result.hasMoov = true;
        result.moovBeforeMdat = !seenMdat;
        result.needsFaststart = seenMdat;
        return result;
      }
      if (!box.size) break;
      offset += box.size;
      if (offset <= 0) break;
    }
  } catch {
    return result;
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
  return result;
};

export const mp4HasMoov = (filePath) => inspectMp4Layout(filePath).hasMoov;

/** True when `moov` sits after `mdat` so browsers cannot seek until the whole file is scanned. */
export const mp4NeedsFaststart = (filePath) => inspectMp4Layout(filePath).needsFaststart;

export const mp4IsFaststart = (filePath) => {
  const layout = inspectMp4Layout(filePath);
  return layout.hasMoov && layout.moovBeforeMdat;
};

const runFfmpeg = (ffmpeg, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
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

const webMp4PathFor = (mp4Path) => String(mp4Path || "").replace(/\.mp4$/i, ".web.mp4");

export const streamCacheWebPlaybackPath = (mp4Path) => webMp4PathFor(mp4Path);

const remuxCopyFaststart = async (sourcePath, destPath, isCurrent = () => true) => {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) {
    return { ok: false, reason: "no-ffmpeg" };
  }

  const tmpPath = destPath.replace(/\.mp4$/i, ".part.mp4");
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  try {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      sourcePath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      tmpPath,
    ]);
    if (!isCurrent()) {
      throw new Error("cancelled");
    }
    if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size < 1024) {
      throw new Error("faststart remux produced an empty file");
    }
    if (mp4NeedsFaststart(tmpPath)) {
      throw new Error("faststart remux still has moov after mdat");
    }
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    fs.renameSync(tmpPath, destPath);
    return { ok: true };
  } catch (error) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    return { ok: false, reason: error?.message || "remux-failed" };
  }
};

export const isFaststartJobRunning = (destPath) => jobs.has(path.resolve(String(destPath || "")));

export const cancelStreamCacheFaststart = (mp4Path) => {
  const dest = path.resolve(webMp4PathFor(mp4Path));
  remuxEpoch.set(dest, (remuxEpoch.get(dest) || 0) + 1);
};

/**
 * Write a browser-safe copy next to the cache `.mp4` (does not replace the original,
 * so a file currently being streamed stays readable on Windows).
 */
export const scheduleStreamCacheFaststart = (sourcePath, mp4Path) => {
  const destPath = webMp4PathFor(mp4Path);
  if (!sourcePath || !destPath || !fs.existsSync(sourcePath)) {
    return Promise.resolve({ ok: false, reason: "missing-source" });
  }

  if (mp4IsFaststart(destPath)) {
    failed.delete(path.resolve(destPath));
    return Promise.resolve({ ok: true, skipped: true, destPath });
  }

  const key = path.resolve(destPath);
  const recentFail = failed.get(key);
  if (recentFail && Date.now() - recentFail.at < FAIL_RETRY_MS) {
    return Promise.resolve({ ok: false, reason: recentFail.reason, skipped: true });
  }

  const existing = jobs.get(key);
  if (existing) return existing;

  const epoch = remuxEpoch.get(key) || 0;
  const job = remuxCopyFaststart(sourcePath, destPath, () => (remuxEpoch.get(key) || 0) === epoch)
    .then((result) => {
      if (result.ok) failed.delete(key);
      else if (result.reason !== "cancelled") failed.set(key, { at: Date.now(), reason: result.reason });
      return result;
    })
    .finally(() => {
      jobs.delete(key);
    });
  jobs.set(key, job);
  return job;
};

export const getStreamCachePlaybackFile = (paths, expectedSize = 0) => {
  const minBytes = Math.max(1024 * 1024, Math.floor(Number(expectedSize || 0) * 0.9));
  const largeEnough = (filePath) => {
    try {
      const size = fs.statSync(filePath).size;
      if (expectedSize > 0) return size >= minBytes;
      return size > 1024 * 1024;
    } catch {
      return false;
    }
  };

  const webPath = webMp4PathFor(paths?.mp4Path);
  if (webPath && fs.existsSync(webPath) && mp4IsFaststart(webPath) && largeEnough(webPath)) {
    return { absolutePath: webPath, playExt: ".web.mp4", faststart: true };
  }
  if (paths?.mp4Path && fs.existsSync(paths.mp4Path) && mp4HasMoov(paths.mp4Path) && largeEnough(paths.mp4Path)) {
    return {
      absolutePath: paths.mp4Path,
      playExt: ".mp4",
      faststart: mp4IsFaststart(paths.mp4Path),
    };
  }
  if (paths?.binPath && fs.existsSync(paths.binPath) && mp4HasMoov(paths.binPath) && largeEnough(paths.binPath)) {
    return {
      absolutePath: paths.binPath,
      playExt: ".bin",
      faststart: mp4IsFaststart(paths.binPath),
    };
  }
  return null;
};
