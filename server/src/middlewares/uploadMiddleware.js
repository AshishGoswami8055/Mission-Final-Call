import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { DEFAULT_UPLOAD_FOLDER, getUploadFolderForCourseId } from "../config/cdsCourses.js";
import Subject from "../models/Subject.js";
import { detectTypeFromMime } from "../utils/contentHelpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");
const TEMP_VIDEO_DIR = path.join(uploadRoot, "_tmp_videos");
const TEMP_PAPER_DIR = path.join(uploadRoot, "_tmp_papers");
const MAX_UPLOAD_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB per file

const toSafeSegment = (value = "") =>
  String(value)
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";

const ensureDirectory = (relativePath) => {
  const fullPath = path.join(uploadRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return fullPath;
};

const ensureAbsoluteDirectory = (absolutePath) => {
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }
  return absolutePath;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    (async () => {
      const detected = detectTypeFromMime(file.mimetype);
      if (!detected) return cb(new Error("Only video and PDF files are allowed"));

      // Videos are uploaded to Cloudinary by the controller, so Multer only
      // needs a scratch directory the controller can read from and then delete.
      if (detected === "video") {
        const tempDir = ensureAbsoluteDirectory(TEMP_VIDEO_DIR);
        return cb(null, tempDir);
      }

      // Paper PDFs: scratch only — paperController uploads to Cloudinary then deletes temp.
      const isPaperRoute = /\/papers\b/i.test(String(req.originalUrl || req.baseUrl || ""));
      if (detected === "pdf" && isPaperRoute) {
        const tempDir = ensureAbsoluteDirectory(TEMP_PAPER_DIR);
        return cb(null, tempDir);
      }

      // PDFs (course content) live on local disk under the per-subject folder layout.
      const folder = "pdfs";
      const isContentRoute = String(req.baseUrl || "").includes("/contents");
      const subjectId = req.body?.subjectId;
      let subjectFolder = null;

      let courseRoot = DEFAULT_UPLOAD_FOLDER;
      let batchFolder = "Main";
      if (isContentRoute && subjectId) {
        try {
          const subject = await Subject.findById(subjectId).select("name").populate("programmeId", "folderSlug cdsCycleId");
          const prog = subject?.programmeId;
          courseRoot = getUploadFolderForCourseId(prog?.cdsCycleId);
          batchFolder = prog?.folderSlug || "Main";
          subjectFolder = toSafeSegment(subject?.name || subjectId);
        } catch {
          subjectFolder = toSafeSegment(subjectId);
        }
      }

      const relativeFolder = subjectFolder
        ? path.join(courseRoot, batchFolder, "subjects", subjectFolder, folder)
        : path.join(courseRoot, batchFolder, folder);
      const destination = ensureDirectory(relativeFolder);
      cb(null, destination);
    })().catch((err) => cb(err));
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const safeName = file.originalname
      .replace(ext, "")
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .toLowerCase();
    cb(null, `${safeName}_${timestamp}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const type = detectTypeFromMime(file.mimetype);
  if (!type) {
    return cb(new Error("Invalid file type. Upload video or PDF only."));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
  },
});

export const TEMP_VIDEO_UPLOAD_DIR = TEMP_VIDEO_DIR;

export default upload;
