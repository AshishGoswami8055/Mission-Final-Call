import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `Command failed: ${cmd}`));
    });
  });

const findExecutableRecursive = (rootDir, exeName, maxDepth = 5, depth = 0) => {
  if (!rootDir || depth > maxDepth || !fs.existsSync(rootDir)) return null;
  const direct = path.join(rootDir, exeName);
  if (fs.existsSync(direct)) return direct;
  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findExecutableRecursive(path.join(rootDir, entry.name), exeName, maxDepth, depth + 1);
    if (found) return found;
  }
  return null;
};

let cachedFfmpeg = undefined;

/** Returns absolute path to ffmpeg binary, or bare command name if found on PATH. */
export const resolveFfmpegBinary = async () => {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg;

  const envPath = String(process.env.FFMPEG_PATH || "").trim();
  if (envPath && fs.existsSync(envPath)) {
    try {
      await run(envPath, ["-version"]);
      cachedFfmpeg = envPath;
      return cachedFfmpeg;
    } catch {
      /* fall through */
    }
  }

  const exeName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    exeName,
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", exeName),
  ].filter(Boolean);

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const wingetPackagesDir = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetPackagesDir)) {
      for (const entry of fs.readdirSync(wingetPackagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.toLowerCase().includes("ffmpeg")) continue;
        const pkgDir = path.join(wingetPackagesDir, entry.name);
        const recursiveHit = findExecutableRecursive(pkgDir, exeName, 6);
        if (recursiveHit) candidates.push(recursiveHit);
        candidates.push(path.join(pkgDir, "bin", exeName));
      }
    }
  }

  for (const cmd of candidates) {
    const hasPathSeparator = /[\\/]/.test(cmd);
    if (hasPathSeparator && !fs.existsSync(cmd)) continue;
    try {
      await run(cmd, ["-version"]);
      cachedFfmpeg = cmd;
      return cachedFfmpeg;
    } catch {
      /* try next */
    }
  }

  if (process.platform === "win32") {
    try {
      const where = await run("where", [exeName.replace(/\.exe$/i, "")]);
      const firstLine = String(where.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (firstLine && fs.existsSync(firstLine)) {
        cachedFfmpeg = firstLine;
        return cachedFfmpeg;
      }
    } catch {
      /* ignore */
    }
  }

  cachedFfmpeg = null;
  return null;
};

export const resetFfmpegBinaryCache = () => {
  cachedFfmpeg = undefined;
};
