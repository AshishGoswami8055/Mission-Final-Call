import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDistinctCourseUploadFolders, getUploadFolderForCourseId } from "../config/cdsCourses.js";
import Content from "../models/Content.js";
import Subject from "../models/Subject.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");

const sanitizeSegment = (value = "") =>
  String(value)
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const relativeToAbsolute = (relativeUploadsPath) => {
  const clean = String(relativeUploadsPath || "").replace(/^\/?uploads\/?/, "");
  return path.join(uploadRoot, clean);
};

const toUploadsRelative = (absolutePath) => {
  const rel = path.relative(uploadRoot, absolutePath).split(path.sep).join("/");
  return `/uploads/${rel}`;
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

const isObjectIdLike = (value = "") => /^[a-f0-9]{24}$/i.test(String(value));

const removeEmptyDirsRecursive = (dir) => {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return 0;
  let removed = 0;
  const children = fs.readdirSync(dir, { withFileTypes: true });
  for (const child of children) {
    if (child.isDirectory()) {
      removed += removeEmptyDirsRecursive(path.join(dir, child.name));
    }
  }
  const remaining = fs.readdirSync(dir);
  if (remaining.length === 0) {
    fs.rmdirSync(dir);
    return removed + 1;
  }
  return removed;
};

const removeYtTempFilesRecursive = (dir) => {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return 0;
  let removed = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += removeYtTempFilesRecursive(full);
      continue;
    }
    const name = entry.name.toLowerCase();
    const isTempFragment =
      /\.f\d+\.(mp4|m4a|webm|mkv|m4v|aac|opus)$/i.test(name) ||
      name.endsWith(".part") ||
      name.endsWith(".ytdl");
    if (isTempFragment) {
      try {
        fs.unlinkSync(full);
        removed += 1;
      } catch {
        // skip locked file
      }
    }
  }
  return removed;
};

const listFilesRecursive = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (p) => {
    const entries = fs.readdirSync(p, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
};

const cleanupLegacySubjectIdFolders = async () => {
  const subjectsRoot = path.join(uploadRoot, "subjects");
  if (!fs.existsSync(subjectsRoot)) {
    return { movedLegacyFiles: 0, removedLegacyDirs: 0 };
  }

  const entries = fs.readdirSync(subjectsRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
  const legacyIdDirs = entries.filter((e) => isObjectIdLike(e.name)).map((e) => e.name);
  if (!legacyIdDirs.length) {
    return { movedLegacyFiles: 0, removedLegacyDirs: 0 };
  }

  const subjects = await Subject.find({ _id: { $in: legacyIdDirs } }).select("_id name");
  const idToName = new Map(subjects.map((s) => [String(s._id), sanitizeSegment(s.name)]));

  let movedLegacyFiles = 0;
  for (const subjectId of legacyIdDirs) {
    const subjectNamePart = idToName.get(subjectId);
    if (!subjectNamePart) continue;

    const fromDir = path.join(subjectsRoot, subjectId);
    const toDir = path.join(subjectsRoot, subjectNamePart);
    ensureDir(toDir);

    const allFiles = listFilesRecursive(fromDir);
    for (const filePath of allFiles) {
      const rel = path.relative(fromDir, filePath);
      const candidate = withUniqueName(path.join(toDir, rel));
      moveFileSafe(filePath, candidate);
      movedLegacyFiles += 1;
    }
  }

  // Remove empty legacy directories and now-empty roots.
  let removedLegacyDirs = 0;
  for (const subjectId of legacyIdDirs) {
    const legacyDir = path.join(subjectsRoot, subjectId);
    if (fs.existsSync(legacyDir)) {
      removedLegacyDirs += removeEmptyDirsRecursive(legacyDir);
    }
  }

  // Cleanup old flat roots if empty.
  ["videos", "pdfs"].forEach((folder) => {
    const p = path.join(uploadRoot, folder);
    if (fs.existsSync(p)) {
      removedLegacyDirs += removeEmptyDirsRecursive(p);
    }
  });

  return { movedLegacyFiles, removedLegacyDirs };
};

export const organizeContentUploadsBySubject = async () => {
  const contents = await Content.find({
    sourceType: "upload",
    filePath: { $type: "string", $ne: null },
    subjectId: { $exists: true, $ne: null },
    type: { $in: ["video", "pdf"] },
  })
    .populate({ path: "subjectId", select: "name programmeId", populate: { path: "programmeId", select: "folderSlug cdsCycleId" } })
    .select("_id subjectId type filePath");

  // Preload subject names for robust fallback when populate misses.
  const subjectIds = Array.from(
    new Set(
      contents
        .map((item) => {
          const raw = item.subjectId?._id || item.subjectId;
          return raw ? String(raw) : null;
        })
        .filter(Boolean)
    )
  );
  const subjectMap = new Map();
  if (subjectIds.length) {
    const subjects = await Subject.find({ _id: { $in: subjectIds } })
      .select("_id name programmeId")
      .populate("programmeId", "folderSlug cdsCycleId");
    subjects.forEach((s) => subjectMap.set(String(s._id), s));
  }

  let moved = 0;
  let updated = 0;
  let missing = 0;
  let skipped = 0;

  for (const item of contents) {
    const currentFilePath = String(item.filePath || "");
    if (!currentFilePath.startsWith("/uploads/")) {
      skipped += 1;
      continue;
    }

    const absoluteCurrent = relativeToAbsolute(currentFilePath);
    if (!fs.existsSync(absoluteCurrent)) {
      missing += 1;
      continue;
    }

    const rawSubjectId = String(item.subjectId?._id || item.subjectId || "");
    const subRow = subjectMap.get(rawSubjectId);
    const subjectName = item.subjectId?.name || subRow?.name || rawSubjectId;
    const prog = item.subjectId?.programmeId || subRow?.programmeId;
    const courseFolder = getUploadFolderForCourseId(prog?.cdsCycleId);
    const batchFolder = prog?.folderSlug || "Main";
    const subjectPart = sanitizeSegment(subjectName);
    const fileFolder = item.type === "video" ? "videos" : "pdfs";
    const targetDir = path.join(uploadRoot, courseFolder, batchFolder, "subjects", subjectPart, fileFolder);
    const alreadyInTarget = absoluteCurrent.startsWith(`${targetDir}${path.sep}`) || absoluteCurrent === path.join(targetDir, path.basename(absoluteCurrent));

    let absoluteNext = absoluteCurrent;
    if (!alreadyInTarget) {
      ensureDir(targetDir);
      const initialTarget = path.join(targetDir, path.basename(absoluteCurrent));
      absoluteNext = withUniqueName(initialTarget);
      moveFileSafe(absoluteCurrent, absoluteNext);
      moved += 1;
    }

    const newFilePath = toUploadsRelative(absoluteNext);
    if (newFilePath !== item.filePath) {
      item.filePath = newFilePath;
      await item.save();
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  const cleanup = await cleanupLegacySubjectIdFolders();
  return {
    scanned: contents.length,
    moved,
    updated,
    missing,
    skipped,
    movedLegacyFiles: cleanup.movedLegacyFiles,
    removedLegacyDirs: cleanup.removedLegacyDirs,
  };
};

export const cleanupBrokenYoutubeTempFiles = async () => {
  const targets = [
    path.join(uploadRoot, "videos"),
    path.join(uploadRoot, "pdfs"),
    path.join(uploadRoot, "subjects"),
    ...getDistinctCourseUploadFolders().map((name) => path.join(uploadRoot, name)),
  ];
  let removed = 0;
  targets.forEach((target) => {
    removed += removeYtTempFilesRecursive(target);
  });
  return { removed };
};

