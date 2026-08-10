import fs from "node:fs";
import path from "node:path";
import Content from "../models/Content.js";
import Subject from "../models/Subject.js";
import {
  ensureLocalMediaDirs,
  getLocalMediaRoot,
  getMergedSubjectsDir,
  isPathUnderLocalMediaRoot,
  resolveMediaAbsolutePath,
  toMediaWebPath,
} from "../config/mediaStorage.js";
import { openFolderInFileManager, revealPathInFileManager } from "../utils/revealInFileManager.js";

const metaPathFor = (subjectId) => path.join(getMergedSubjectsDir(), `${subjectId}.meta.json`);

const canonicalFileName = (subjectId) => `${String(subjectId)}_full_course.mp4`;

const canonicalAbsolutePath = (subjectId) =>
  path.join(getMergedSubjectsDir(), canonicalFileName(subjectId));

const canonicalWebPath = (subjectId) =>
  toMediaWebPath("_merged_subjects", canonicalFileName(subjectId));

const safeSubjectFileName = (name) =>
  String(name || "subject")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim();

const isValidVideoFile = (absolutePath) => {
  try {
    return Boolean(absolutePath && fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 1024);
  } catch {
    return false;
  }
};

const readMeta = (subjectId) => {
  const metaPath = metaPathFor(subjectId);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
};

const writeMeta = (meta) => {
  ensureLocalMediaDirs();
  fs.writeFileSync(metaPathFor(meta.subjectId), JSON.stringify(meta, null, 2));
};

/** Remove legacy auto-stitched files ({subjectId}_{hash}.mp4) so only the linked file remains. */
const purgeLegacySubjectVideos = (subjectId, keepAbsolute = null) => {
  const dir = getMergedSubjectsDir();
  if (!fs.existsSync(dir)) return;
  const prefix = `${String(subjectId)}_`;
  const keepResolved = keepAbsolute ? path.resolve(keepAbsolute) : null;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".mp4") || !name.startsWith(prefix)) continue;
    if (name === canonicalFileName(subjectId)) continue;
    const absolute = path.join(dir, name);
    if (keepResolved && path.resolve(absolute) === keepResolved) continue;
    try {
      fs.unlinkSync(absolute);
    } catch {
      /* ignore */
    }
  }
};

const normalizeUserPath = (value) =>
  path.resolve(String(value || "").trim().replace(/^["']|["']$/g, ""));

const webPathForAbsolute = (absolute) => {
  if (!absolute || !isPathUnderLocalMediaRoot(absolute)) return null;
  const rel = path
    .relative(path.resolve(getLocalMediaRoot()), path.resolve(absolute))
    .replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) return null;
  return toMediaWebPath("", rel);
};

const resolveLinkedAbsolute = (subjectId) => {
  const meta = readMeta(String(subjectId));
  if (meta?.linkedSourcePath) {
    const source = normalizeUserPath(meta.linkedSourcePath);
    if (isValidVideoFile(source)) return source;
  }
  const canonical = canonicalAbsolutePath(subjectId);
  if (isValidVideoFile(canonical)) return canonical;
  return null;
};

const syncMetaForCanonical = (subjectId, subject, absolute) => {
  const meta = readMeta(String(subjectId));
  const webPath = webPathForAbsolute(absolute);
  const sizeBytes = fs.statSync(absolute).size;
  if (
    meta?.linkedSourcePath === absolute &&
    meta?.sizeBytes === sizeBytes &&
    meta?.filePath === webPath
  ) {
    return meta;
  }
  const nextMeta = {
    subjectId: String(subjectId),
    subjectName: subject.name,
    linkedSourcePath: absolute,
    filePath: webPath,
    fileName: meta?.fileName || `${safeSubjectFileName(subject.name)}_full_course.mp4`,
    originalFileName: meta?.originalFileName || meta?.fileName || path.basename(absolute),
    sizeBytes,
    linkedAt: meta?.linkedAt || new Date().toISOString(),
  };
  writeMeta(nextMeta);
  return nextMeta;
};

export const getSubjectFullCourseStatus = async (subjectId) => {
  const subject = await Subject.findById(subjectId).lean();
  if (!subject) return null;

  const videoCount = await Content.countDocuments({ subjectId, type: "video" });
  const absolute = resolveLinkedAbsolute(subjectId);

  if (!absolute) {
    purgeLegacySubjectVideos(subjectId);
    const staleMetaPath = metaPathFor(subjectId);
    if (fs.existsSync(staleMetaPath)) {
      try {
        fs.unlinkSync(staleMetaPath);
      } catch {
        /* ignore */
      }
    }
    return {
      subjectId: String(subjectId),
      subjectName: subject.name,
      videoCount,
      ready: false,
      filePath: null,
      fileName: null,
      sizeBytes: 0,
      linkedAt: null,
      originalFileName: null,
    };
  }

  const meta = syncMetaForCanonical(subjectId, subject, absolute);
  const sizeBytes = fs.statSync(absolute).size;
  const filePath = webPathForAbsolute(absolute);

  return {
    subjectId: String(subjectId),
    subjectName: subject.name,
    videoCount,
    ready: true,
    filePath,
    usesStream: !filePath,
    fileName: meta.fileName,
    sizeBytes,
    linkedAt: meta.linkedAt,
    originalFileName: meta.originalFileName,
  };
};

/** @deprecated alias kept for route handlers during rename */
export const getSubjectMergedVideoStatus = getSubjectFullCourseStatus;

export const getFullCourseAbsolutePath = async (subjectId) => resolveLinkedAbsolute(subjectId);

/** @deprecated alias */
export const getMergedVideoAbsolutePath = getFullCourseAbsolutePath;

export const getFullCourseDownloadName = async (subjectId) => {
  const status = await getSubjectFullCourseStatus(subjectId);
  return status?.fileName || "full_course.mp4";
};

/** @deprecated alias */
export const getMergedVideoDownloadName = getFullCourseDownloadName;

/** Link a manually edited full-course MP4 — always stored at one canonical path per subject. */
export const registerSubjectFullCourse = async (subjectId, { uploadedPath, originalName }) => {
  const subject = await Subject.findById(subjectId).lean();
  if (!subject) throw new Error("Subject not found");
  if (!uploadedPath || !fs.existsSync(uploadedPath)) {
    throw new Error("No video file received.");
  }
  if (!isValidVideoFile(uploadedPath)) {
    throw new Error("Select a valid video file.");
  }

  ensureLocalMediaDirs();
  const absoluteOut = canonicalAbsolutePath(subjectId);
  const webPath = canonicalWebPath(subjectId);
  const displayName = originalName || `${safeSubjectFileName(subject.name)}_full_course.mp4`;

  purgeLegacySubjectVideos(subjectId);

  if (path.resolve(uploadedPath) !== path.resolve(absoluteOut)) {
    if (fs.existsSync(absoluteOut)) fs.unlinkSync(absoluteOut);
    fs.renameSync(uploadedPath, absoluteOut);
  }

  const sizeBytes = fs.statSync(absoluteOut).size;
  writeMeta({
    subjectId: String(subjectId),
    subjectName: subject.name,
    linkedSourcePath: absoluteOut,
    filePath: webPathForAbsolute(absoluteOut) || webPath,
    fileName: displayName,
    originalFileName: originalName || path.basename(uploadedPath),
    sizeBytes,
    linkedAt: new Date().toISOString(),
  });

  purgeLegacySubjectVideos(subjectId, absoluteOut);

  return getSubjectFullCourseStatus(subjectId);
};

/** @deprecated alias */
export const registerSubjectMergedVideo = registerSubjectFullCourse;

/** Link a file already on disk by path — no browser upload (for large files, e.g. 20GB+). */
export const linkSubjectFullCourseFromPath = async (subjectId, sourcePath, { originalName } = {}) => {
  const subject = await Subject.findById(subjectId).lean();
  if (!subject) throw new Error("Subject not found");

  const normalized = normalizeUserPath(sourcePath);
  if (!normalized || !fs.existsSync(normalized)) {
    throw new Error("File not found. Paste the full path to your MP4, e.g. C:\\Videos\\course.mp4");
  }
  if (!isValidVideoFile(normalized)) {
    throw new Error("Not a valid video file.");
  }

  purgeLegacySubjectVideos(subjectId);

  const canonical = canonicalAbsolutePath(subjectId);
  if (path.resolve(normalized) !== path.resolve(canonical) && fs.existsSync(canonical)) {
    try {
      fs.unlinkSync(canonical);
    } catch {
      /* ignore */
    }
  }

  const sizeBytes = fs.statSync(normalized).size;
  const webPath = webPathForAbsolute(normalized);
  const displayName = originalName || path.basename(normalized);

  writeMeta({
    subjectId: String(subjectId),
    subjectName: subject.name,
    linkedSourcePath: normalized,
    filePath: webPath,
    fileName: displayName,
    originalFileName: displayName,
    sizeBytes,
    linkedAt: new Date().toISOString(),
  });

  return getSubjectFullCourseStatus(subjectId);
};

export const revealSubjectFullCourse = async (subjectId) => {
  const status = await getSubjectFullCourseStatus(subjectId);
  if (!status) throw new Error("Subject not found");

  const absolute = resolveLinkedAbsolute(subjectId);
  if (absolute) {
    await revealPathInFileManager(absolute);
    return { revealed: "file", path: absolute };
  }

  ensureLocalMediaDirs();
  const dir = getMergedSubjectsDir();
  await openFolderInFileManager(dir);
  return {
    revealed: "folder",
    path: dir,
    message: `Opened full course folder. For large files, use Link from path instead of upload.`,
    expectedFileName: canonicalFileName(subjectId),
  };
};

/** @deprecated alias */
export const revealSubjectMergedVideo = revealSubjectFullCourse;
