import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const normalizeWindowsPath = (value) => path.normalize(String(value || "").replace(/"/g, "").trim());

const escapeForPowerShell = (value) => normalizeWindowsPath(value).replace(/'/g, "''");

const runPowerShell = async (script) => {
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true }
  );
};

/** Highlight a file in Windows Explorer (handles paths with spaces). */
const revealOnWindows = async (absolutePath) => {
  const target = escapeForPowerShell(absolutePath);
  await runPowerShell(`Start-Process explorer.exe -ArgumentList '/select,"${target}"'`);
};

/** Open a folder in Windows Explorer. */
const openFolderOnWindows = async (absoluteDir) => {
  const target = escapeForPowerShell(absoluteDir);
  await runPowerShell(`Start-Process explorer.exe -ArgumentList '"${target}"'`);
};

/** Open the system file manager and highlight a file (Windows Explorer / Finder / xdg-open). */
export const revealPathInFileManager = async (absolutePath) => {
  const resolved = path.resolve(normalizeWindowsPath(absolutePath));
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error("File not found on disk.");
  }

  if (process.platform === "win32") {
    await revealOnWindows(resolved);
    return;
  }

  if (process.platform === "darwin") {
    await execFileAsync("open", ["-R", resolved]);
    return;
  }

  await execFileAsync("xdg-open", [path.dirname(resolved)]);
};

/** Open a folder in the system file manager (no file selection). */
export const openFolderInFileManager = async (absoluteDir) => {
  const resolved = path.resolve(normalizeWindowsPath(absoluteDir));
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error("Folder not found on disk.");
  }

  if (process.platform === "win32") {
    await openFolderOnWindows(resolved);
    return;
  }

  if (process.platform === "darwin") {
    await execFileAsync("open", [resolved]);
    return;
  }

  await execFileAsync("xdg-open", [resolved]);
};
