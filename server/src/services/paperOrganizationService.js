import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Paper from "../models/Paper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const toAbsolute = (uploadsPath = "") => {
  const clean = String(uploadsPath || "").replace(/^\/?uploads\/?/, "");
  return path.join(uploadRoot, clean);
};

const toUploadsPath = (absolutePath) => {
  const rel = path.relative(uploadRoot, absolutePath).split(path.sep).join("/");
  return `/uploads/${rel}`;
};

const withUniqueName = (targetPath) => {
  if (!fs.existsSync(targetPath)) return targetPath;
  const ext = path.extname(targetPath);
  const base = targetPath.slice(0, -ext.length);
  let attempt = 1;
  while (attempt < 1000) {
    const candidate = `${base}_${Date.now()}_${attempt}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
    attempt += 1;
  }
  return `${base}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
};

const moveFileSafe = (from, to) => {
  ensureDir(path.dirname(to));
  try {
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
};

export const getPyqYearFolderAbsolute = (year) => {
  const y = Number(year);
  const safeYear = Number.isFinite(y) && y >= 1990 && y <= 2100 ? String(y) : "unknown_year";
  return path.join(uploadRoot, "papers", "PYQ", safeYear);
};

export const movePaperFileToYearFolder = ({ absoluteSourcePath, year, preferredName }) => {
  const source = path.resolve(absoluteSourcePath);
  if (!source.startsWith(uploadRoot) || !fs.existsSync(source)) {
    throw new Error("Paper source file not found");
  }
  const targetDir = getPyqYearFolderAbsolute(year);
  ensureDir(targetDir);
  const basename = preferredName || path.basename(source);
  const target = withUniqueName(path.join(targetDir, basename));
  if (source !== target) {
    moveFileSafe(source, target);
  }
  return {
    absolutePath: target,
    filePath: toUploadsPath(target),
  };
};

const removeEmptyDirsRecursive = (dir) => {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return 0;
  let removed = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      removed += removeEmptyDirsRecursive(path.join(dir, entry.name));
    }
  }
  const remaining = fs.readdirSync(dir);
  if (remaining.length === 0) {
    fs.rmdirSync(dir);
    return removed + 1;
  }
  return removed;
};

export const organizePaperUploadsByYear = async () => {
  const papers = await Paper.find({
    sourceType: "upload",
    filePath: { $type: "string", $ne: null },
  }).select("_id year filePath");

  let moved = 0;
  let updated = 0;
  let missing = 0;
  let skipped = 0;

  for (const paper of papers) {
    const currentPath = String(paper.filePath || "");
    if (!currentPath.startsWith("/uploads/")) {
      skipped += 1;
      continue;
    }
    const absoluteCurrent = toAbsolute(currentPath);
    if (!fs.existsSync(absoluteCurrent)) {
      missing += 1;
      continue;
    }

    const targetDir = getPyqYearFolderAbsolute(paper.year);
    const alreadyInTarget =
      absoluteCurrent.startsWith(`${targetDir}${path.sep}`) ||
      absoluteCurrent === path.join(targetDir, path.basename(absoluteCurrent));

    let absoluteNext = absoluteCurrent;
    if (!alreadyInTarget) {
      const movedInfo = movePaperFileToYearFolder({
        absoluteSourcePath: absoluteCurrent,
        year: paper.year,
        preferredName: path.basename(absoluteCurrent),
      });
      absoluteNext = movedInfo.absolutePath;
      moved += 1;
    }

    const nextFilePath = toUploadsPath(absoluteNext);
    if (nextFilePath !== paper.filePath) {
      paper.filePath = nextFilePath;
      await paper.save();
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  const removedLegacyDirs =
    removeEmptyDirsRecursive(path.join(uploadRoot, "pdfs")) +
    removeEmptyDirsRecursive(path.join(uploadRoot, "papers", "pdfs"));

  return { scanned: papers.length, moved, updated, missing, skipped, removedLegacyDirs };
};

