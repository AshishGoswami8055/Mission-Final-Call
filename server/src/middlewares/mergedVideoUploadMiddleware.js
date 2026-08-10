import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import { getMergedSubjectsDir } from "../config/mediaStorage.js";

const MAX_BYTES = 8 * 1024 * 1024 * 1024;

const isVideoUpload = (file) => {
  if (/^video\//i.test(String(file.mimetype || ""))) return true;
  return /\.(mp4|webm|mkv|mov|m4v)$/i.test(String(file.originalname || ""));
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(getMergedSubjectsDir(), { recursive: true });
      cb(null, getMergedSubjectsDir());
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, _file, cb) => {
    cb(null, `_upload_${String(req.params.id)}_${Date.now()}.mp4`);
  },
});

const mergedVideoReplaceUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isVideoUpload(file)) {
      return cb(new Error("Select a video file (MP4, WebM, MKV, etc.)."));
    }
    cb(null, true);
  },
});

export const uploadMergedVideoReplace = mergedVideoReplaceUpload.single("file");

export default mergedVideoReplaceUpload;
