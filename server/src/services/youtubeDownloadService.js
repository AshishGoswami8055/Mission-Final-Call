import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { DEFAULT_UPLOAD_FOLDER } from "../config/cdsCourses.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");

const ensureVideosDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const sanitizeFileBase = (name = "") =>
  String(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "youtube_video";

const toUploadsWebPath = (absoluteFile) => {
  const rel = path.relative(uploadRoot, path.resolve(absoluteFile)).split(path.sep).join("/");
  return `/uploads/${rel}`;
};

const getVideosDirForSubject = (
  courseFolder = DEFAULT_UPLOAD_FOLDER,
  batchFolder = "Main",
  subjectLabel = ""
) =>
  path.join(
    uploadRoot,
    courseFolder,
    batchFolder,
    "subjects",
    sanitizeFileBase(subjectLabel || "unknown_subject"),
    "videos"
  );

const run = (cmd, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      ...options,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (buf) => {
      stdout += buf.toString();
    });
    child.stderr.on("data", (buf) => {
      stderr += buf.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `Command failed: ${cmd}`));
      }
    });
  });

export const getDownloaderCommand = async () => {
  const candidates = [];

  // Common command aliases
  candidates.push({ cmd: "yt-dlp", prefixArgs: [] });
  candidates.push({ cmd: "yt-dlp.exe", prefixArgs: [] });
  candidates.push({ cmd: "python", prefixArgs: ["-m", "yt_dlp"] });
  candidates.push({ cmd: "py", prefixArgs: ["-m", "yt_dlp"] });

  // Common Windows paths for winget/user installs
  if (process.platform === "win32") {
    const home = os.homedir();
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const winApps = path.join(localAppData, "Microsoft", "WindowsApps", "yt-dlp.exe");
    const pipUser = path.join(home, "AppData", "Roaming", "Python", "Python313", "Scripts", "yt-dlp.exe");
    const pipUser312 = path.join(home, "AppData", "Roaming", "Python", "Python312", "Scripts", "yt-dlp.exe");
    const pipUser311 = path.join(home, "AppData", "Roaming", "Python", "Python311", "Scripts", "yt-dlp.exe");
    [winApps, pipUser, pipUser312, pipUser311].forEach((fullPath) => {
      candidates.push({ cmd: fullPath, prefixArgs: [] });
    });

    // Winget package install folder fallback (works even if PATH/app alias is missing)
    const wingetPackagesDir = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetPackagesDir)) {
      const dirs = fs
        .readdirSync(wingetPackagesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.toLowerCase().startsWith("yt-dlp.yt-dlp"))
        .map((d) => path.join(wingetPackagesDir, d.name));

      dirs.forEach((dir) => {
        const exe = path.join(dir, "yt-dlp.exe");
        if (fs.existsSync(exe)) {
          candidates.push({ cmd: exe, prefixArgs: [] });
        }
      });
    }

    // Use where as resolver (if available in current shell)
    try {
      const whereRes = fs.existsSync(path.join(process.env.WINDIR || "C:\\Windows", "System32", "where.exe"))
        ? null
        : null;
      void whereRes;
      // defer actual where execution to runtime candidate loop below if needed
    } catch {}
  }

  for (const candidate of candidates) {
    const hasPathSeparator = /[\\/]/.test(candidate.cmd);
    if (hasPathSeparator && !fs.existsSync(candidate.cmd)) {
      continue;
    }
    try {
      await run(candidate.cmd, [...candidate.prefixArgs, "--version"]);
      return candidate;
    } catch {
      // try next
    }
  }

  // Last resort: resolve executable path via `where` on Windows
  if (process.platform === "win32") {
    try {
      const where = await run("where", ["yt-dlp"]);
      const firstLine = String(where.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (firstLine) {
        await run(firstLine, ["--version"]);
        return { cmd: firstLine, prefixArgs: [] };
      }
    } catch {
      // ignore and throw final error below
    }
  }

  throw new Error(
    "YouTube downloader is not installed on server. Install yt-dlp (or python -m yt_dlp) to enable YouTube Direct Download."
  );
};

const parseJsonSafe = (text = "") => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const findExecutableRecursive = (rootDir, exeName, maxDepth = 5, depth = 0) => {
  if (!rootDir || !fs.existsSync(rootDir) || depth > maxDepth) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === exeName.toLowerCase()) {
      return full;
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(rootDir, entry.name);
    const found = findExecutableRecursive(full, exeName, maxDepth, depth + 1);
    if (found) return found;
  }
  return null;
};

const resolveFfmpegLocation = async () => {
  const candidates = [
    "ffmpeg",
    "ffmpeg.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", "ffmpeg.exe"),
  ].filter(Boolean);

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const wingetPackagesDir = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetPackagesDir)) {
      const packageDirs = fs
        .readdirSync(wingetPackagesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.toLowerCase().includes("ffmpeg"))
        .map((d) => path.join(wingetPackagesDir, d.name));
      packageDirs.forEach((pkgDir) => {
        const recursiveHit = findExecutableRecursive(pkgDir, "ffmpeg.exe", 6);
        if (recursiveHit) {
          candidates.push(recursiveHit);
        } else {
          // Common nested locations for winget ffmpeg bundles.
          candidates.push(path.join(pkgDir, "bin", "ffmpeg.exe"));
        }
      });
    }
  }

  for (const cmd of candidates) {
    const hasPathSeparator = /[\\/]/.test(cmd);
    if (hasPathSeparator && !fs.existsSync(cmd)) continue;
    try {
      await run(cmd, ["-version"]);
      return hasPathSeparator ? path.dirname(cmd) : null;
    } catch {
      // continue
    }
  }

  if (process.platform === "win32") {
    try {
      const where = await run("where", ["ffmpeg"]);
      const firstLine = String(where.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (firstLine && fs.existsSync(firstLine)) {
        return path.dirname(firstLine);
      }
    } catch {
      // ignore
    }
  }

  return null;
};

export const downloadYouTubeVideo = async ({
  url,
  titleHint = "",
  subjectLabel = "",
  courseFolder = DEFAULT_UPLOAD_FOLDER,
  batchFolder = "Main",
  targetDir = null,
}) => {
  if (!url) throw new Error("YouTube URL is required");
  const videosDir =
    targetDir && String(targetDir).trim()
      ? path.resolve(targetDir)
      : getVideosDirForSubject(courseFolder, batchFolder, subjectLabel);
  ensureVideosDir(videosDir);
  const { cmd, prefixArgs } = await getDownloaderCommand();

  const infoRes = await run(cmd, [...prefixArgs, "--dump-single-json", "--no-playlist", url]);
  const info = parseJsonSafe(infoRes.stdout);
  if (!info?.id) {
    throw new Error("Could not read YouTube video information");
  }

  // Prefer browser-safe MP4/H.264 + AAC at highest available quality, then fallback.
  const baseName = sanitizeFileBase(titleHint || info.title || info.id);
  const finalBase = `${baseName}_${Date.now()}`;
  const outputTemplate = path.join(videosDir, `${finalBase}.%(ext)s`);
  const preferredFormat =
    [
      "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[acodec^=mp4a][ext=m4a]",
      "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]",
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]",
      "bestvideo+bestaudio",
      "best[ext=mp4][vcodec!=none][acodec!=none]",
      "best[vcodec!=none][acodec!=none]",
    ].join("/");
  const progressiveFormat =
    "best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]";
  const ffmpegLocation = await resolveFfmpegLocation();

  const downloadArgs = [
    ...prefixArgs,
    "--no-playlist",
    "--format",
    ffmpegLocation ? preferredFormat : progressiveFormat,
    ...(ffmpegLocation ? ["--ffmpeg-location", ffmpegLocation, "--merge-output-format", "mp4"] : []),
    "--output",
    outputTemplate,
    url,
  ];

  await run(cmd, downloadArgs);

  const files = fs.readdirSync(videosDir);
  const match = files
    .filter((file) => file.startsWith(finalBase))
    .sort((a, b) => fs.statSync(path.join(videosDir, b)).mtimeMs - fs.statSync(path.join(videosDir, a)).mtimeMs)[0];

  if (!match) {
    throw new Error("Download finished but output file was not found");
  }

  const ext = path.extname(match).toLowerCase();
  if ([".m4a", ".mp3", ".aac", ".wav", ".flac", ".opus", ".ogg"].includes(ext)) {
    throw new Error("Downloaded output is audio-only. Please try another video or verify ffmpeg is accessible.");
  }
  const absoluteOut = path.join(videosDir, match);
  const insideUploads = absoluteOut.startsWith(uploadRoot);
  const relativePath = insideUploads ? toUploadsWebPath(absoluteOut) : null;
  const height = Number(info.height) || null;
  const used1080OrHigher = height ? height >= 1080 : null;
  const durationSeconds = Number(info.duration) || null;

  return {
    filePath: relativePath,
    absolutePath: absoluteOut,
    resolvedTitle: String(info.title || titleHint || "YouTube Video").trim(),
    meta: {
      videoId: info.id,
      ext,
      height,
      used1080OrHigher,
      durationSeconds,
      originalFilename: match,
      originalUrl: info.webpage_url || url,
    },
  };
};

