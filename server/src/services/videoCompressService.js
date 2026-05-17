import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Server-side video compression to web-friendly 720p MP4 (H.264 + AAC + faststart),
 * with live progress events parsed from ffmpeg's `-progress pipe:1` output.
 *
 * Tunable via env (server/.env), all optional:
 *   VIDEO_COMPRESS_CRF=23                # 18 = visually lossless, 23 = good, 28 = small
 *   VIDEO_COMPRESS_HEIGHT=720            # max output height; aspect ratio preserved
 *   VIDEO_COMPRESS_PRESET=medium         # x264 preset: ultrafast..veryslow
 *   VIDEO_COMPRESS_AUDIO_BITRATE=128k
 *   VIDEO_COMPRESS_SKIP_BELOW_MB=80      # skip when input is already small enough AND <= target height
 */

const TARGET_HEIGHT = Math.max(240, Number(process.env.VIDEO_COMPRESS_HEIGHT || 720));
const CRF = Math.max(0, Math.min(51, Number(process.env.VIDEO_COMPRESS_CRF || 23)));
const PRESET = String(process.env.VIDEO_COMPRESS_PRESET || "medium");
const AUDIO_BITRATE = String(process.env.VIDEO_COMPRESS_AUDIO_BITRATE || "128k");
const SKIP_IF_BELOW_BYTES = Math.max(
  1,
  Number(process.env.VIDEO_COMPRESS_SKIP_BELOW_MB || 80) * 1024 * 1024
);

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `Command failed: ${cmd}`));
    });
  });

const findExecutableRecursive = (rootDir, exeName, maxDepth = 6, depth = 0) => {
  if (!rootDir || !fs.existsSync(rootDir) || depth > maxDepth) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === exeName.toLowerCase()) return full;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(rootDir, entry.name);
    const found = findExecutableRecursive(full, exeName, maxDepth, depth + 1);
    if (found) return found;
  }
  return null;
};

const _binCache = {};
const resolveBin = async (name) => {
  if (_binCache[name]) return _binCache[name];

  const winSuffix = process.platform === "win32" ? ".exe" : "";
  const exe = name + winSuffix;
  const candidates = [name, exe];
  if (process.platform === "win32") {
    candidates.push(path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", exe));
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const wingetPackagesDir = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetPackagesDir)) {
      const packageDirs = fs
        .readdirSync(wingetPackagesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.toLowerCase().includes("ffmpeg"))
        .map((d) => path.join(wingetPackagesDir, d.name));
      for (const pkgDir of packageDirs) {
        const hit = findExecutableRecursive(pkgDir, exe, 6);
        if (hit) candidates.push(hit);
      }
    }
  }

  for (const cmd of candidates.filter(Boolean)) {
    const hasPath = /[\\/]/.test(cmd);
    if (hasPath && !fs.existsSync(cmd)) continue;
    try {
      await run(cmd, ["-version"]);
      _binCache[name] = cmd;
      return cmd;
    } catch {
      // try next
    }
  }

  if (process.platform === "win32") {
    try {
      const where = await run("where", [name]);
      const firstLine = String(where.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (firstLine && fs.existsSync(firstLine)) {
        await run(firstLine, ["-version"]);
        _binCache[name] = firstLine;
        return firstLine;
      }
    } catch {
      // ignore
    }
  }

  return null;
};

export const probeVideo = async (filePath) => {
  if (!fs.existsSync(filePath)) throw new Error(`Video file not found: ${filePath}`);
  const ffprobe = await resolveBin("ffprobe");
  if (!ffprobe) {
    throw new Error(
      "ffprobe (part of ffmpeg) is not installed or not on PATH. Install ffmpeg to enable video compression."
    );
  }
  const args = [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ];
  const { stdout } = await run(ffprobe, args);
  const data = JSON.parse(stdout || "{}");
  const v = (data.streams || []).find((s) => s.codec_type === "video") || null;
  const a = (data.streams || []).find((s) => s.codec_type === "audio") || null;
  const stat = fs.statSync(filePath);
  return {
    width: Number(v?.width || 0),
    height: Number(v?.height || 0),
    codec: String(v?.codec_name || "").toLowerCase(),
    audioCodec: String(a?.codec_name || "").toLowerCase(),
    durationSeconds: Number(v?.duration || a?.duration || data.format?.duration || 0),
    sizeBytes: Number(data.format?.size || stat.size),
    pixFmt: String(v?.pix_fmt || ""),
  };
};

/**
 * Decide whether the input needs to be re-encoded before Cloudinary upload.
 * Compresses when ANY of these is true:
 *   - file size >= SKIP_IF_BELOW_BYTES  (so it can fit under Cloudinary's free 100 MB limit)
 *   - input height > TARGET_HEIGHT     (so we drop big resolutions to 720p)
 *   - codec is not h264                (Cloudinary plays better with H.264)
 *   - container is not MP4-friendly (we always re-mux to mp4 with faststart anyway)
 */
export const needsCompression = (probe) => {
  if (!probe) return true;
  if (probe.sizeBytes >= SKIP_IF_BELOW_BYTES) return true;
  if (probe.height && probe.height > TARGET_HEIGHT) return true;
  if (probe.codec && probe.codec !== "h264") return true;
  return false;
};

const formatProgressLines = (text = "") => {
  // ffmpeg `-progress` writes pairs of `key=value\n` blocks separated by `progress=continue|end`.
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const idx = raw.indexOf("=");
    if (idx <= 0) continue;
    const k = raw.slice(0, idx).trim();
    const v = raw.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
};

export const compressVideoTo720p = async ({
  inputPath,
  outputPath,
  onProgress,
  targetHeight = TARGET_HEIGHT,
  crf = CRF,
  preset = PRESET,
} = {}) => {
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error("compressVideoTo720p: input file not found");
  }
  if (!outputPath) throw new Error("compressVideoTo720p: outputPath is required");

  const ffmpeg = await resolveBin("ffmpeg");
  if (!ffmpeg) {
    throw new Error(
      "ffmpeg is not installed or not on PATH. Install ffmpeg (https://ffmpeg.org/download.html) to enable video compression."
    );
  }

  const probe = await probeVideo(inputPath).catch(() => null);
  const totalDurationSec = probe?.durationSeconds || 0;

  // Don't upscale: clamp to min(targetHeight, original height).
  const heightExpr = `min(${Math.max(120, Math.floor(targetHeight))}\\,ih)`;
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    // -2 keeps width even (required by yuv420p) and preserves aspect ratio.
    "-vf",
    `scale=-2:'${heightExpr}'`,
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level",
    "4.0",
    "-c:a",
    "aac",
    "-b:a",
    AUDIO_BITRATE,
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdoutBuf = "";
    let lastEmit = 0;
    let lastSpeed = null;

    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString();
      const blocks = stdoutBuf.split(/(?:^|\n)progress=(?:continue|end)\r?\n/);
      // Last item may be partial; keep it in buffer.
      stdoutBuf = blocks.pop() || "";
      for (const block of blocks) {
        const fields = formatProgressLines(block);
        const outTimeUs = Number(fields.out_time_us || 0);
        const outTimeMs = Number(fields.out_time_ms || 0); // some builds: ms; others: us — handle both.
        const outSeconds = outTimeUs > 0 ? outTimeUs / 1e6 : outTimeMs > 0 ? outTimeMs / 1e3 : 0;
        if (fields.speed) lastSpeed = String(fields.speed).trim();

        if (typeof onProgress === "function" && totalDurationSec > 0 && outSeconds > 0) {
          const t = Date.now();
          if (t - lastEmit > 200) {
            const percent = Math.min(99, (outSeconds / totalDurationSec) * 100);
            try {
              onProgress({
                percent,
                currentSeconds: outSeconds,
                totalSeconds: totalDurationSec,
                speed: lastSpeed,
              });
            } catch {
              /* ignore listener errors */
            }
            lastEmit = t;
          }
        }
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      }
      try {
        const stat = fs.statSync(outputPath);
        if (typeof onProgress === "function") {
          try {
            onProgress({
              percent: 100,
              currentSeconds: totalDurationSec,
              totalSeconds: totalDurationSec,
              speed: lastSpeed,
            });
          } catch {
            /* ignore */
          }
        }
        resolve({
          outputPath,
          sizeBytes: stat.size,
          targetHeight,
          crf,
          preset,
          durationSeconds: totalDurationSec,
        });
      } catch (e) {
        reject(e);
      }
    });
  });
};

/**
 * Auto-fit compression: try sequential (height, CRF) presets until the encoded
 * file is <= maxBytes. The first attempt uses the configured defaults, the next
 * ones drop quality / resolution to keep large lectures under the limit.
 *
 * Each attempt overwrites the same outputPath. If no attempt fits, the last
 * attempt's file is returned along with `fits: false`.
 */
export const autofitCompressVideo = async ({
  inputPath,
  outputPath,
  maxBytes = 95 * 1024 * 1024,
  onProgress,
  attempts: customAttempts,
} = {}) => {
  const attempts =
    Array.isArray(customAttempts) && customAttempts.length
      ? customAttempts
      : [
          { height: TARGET_HEIGHT, crf: CRF, preset: PRESET, label: `${TARGET_HEIGHT}p · CRF ${CRF}` },
          { height: TARGET_HEIGHT, crf: CRF + 4, preset: PRESET, label: `${TARGET_HEIGHT}p · CRF ${CRF + 4}` },
          { height: 540, crf: CRF + 6, preset: PRESET, label: `540p · CRF ${CRF + 6}` },
          { height: 480, crf: CRF + 8, preset: PRESET, label: `480p · CRF ${CRF + 8}` },
          { height: 360, crf: CRF + 10, preset: PRESET, label: `360p · CRF ${CRF + 10}` },
        ];

  let last = null;
  for (let i = 0; i < attempts.length; i += 1) {
    const a = attempts[i];
    last = await compressVideoTo720p({
      inputPath,
      outputPath,
      onProgress: (p) =>
        typeof onProgress === "function" &&
        onProgress({ ...p, attempt: i + 1, attempts: attempts.length, label: a.label }),
      targetHeight: a.height,
      crf: a.crf,
      preset: a.preset,
    });
    if (last.sizeBytes <= maxBytes) {
      return { ...last, fits: true, attemptIndex: i, attemptLabel: a.label, totalAttempts: i + 1 };
    }
  }
  return { ...last, fits: false, attemptIndex: attempts.length - 1, attemptLabel: attempts[attempts.length - 1].label, totalAttempts: attempts.length };
};

export const compressDefaults = {
  TARGET_HEIGHT,
  CRF,
  PRESET,
  AUDIO_BITRATE,
  SKIP_IF_BELOW_BYTES,
};
