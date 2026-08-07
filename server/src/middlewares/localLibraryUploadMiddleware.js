import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import { getLocalLibraryDir } from "../config/mediaStorage.js";

const MAX_BYTES = 5 * 1024 * 1024 * 1024;

const safeExt = (fileName = "", mimeType = "") => {
  const fromName = path.extname(String(fileName)).toLowerCase();
  if (fromName && fromName.length <= 6) return fromName;
  if (/mp4/i.test(mimeType)) return ".mp4";
  if (/webm/i.test(mimeType)) return ".webm";
  if (/matroska/i.test(mimeType)) return ".mkv";
  if (/quicktime/i.test(mimeType)) return ".mov";
  return ".mp4";
};

const isVideoUpload = (file) => {
  if (/^video\//i.test(String(file.mimetype || ""))) return true;
  return /\.(mp4|webm|mkv|mov|m4v)$/i.test(String(file.originalname || ""));
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(getLocalLibraryDir(), { recursive: true });
      cb(null, getLocalLibraryDir());
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const ext = safeExt(file.originalname, file.mimetype);
    cb(null, `${String(req.params.id)}${ext}`);
  },
});

const localLibraryReplaceUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isVideoUpload(file)) {
      return cb(new Error("Select a video file (MP4, WebM, MKV, etc.)."));
    }
    cb(null, true);
  },
});

export const uploadLocalLibraryReplace = localLibraryReplaceUpload.single("file");

export default localLibraryReplaceUpload;
