import path from "node:path";
import fs from "node:fs";
import {
  getLocalMediaRoot,
  isUsingCustomLocalMediaRoot,
  LOCAL_MEDIA_SUBDIRS,
} from "../config/mediaStorage.js";
import { streamLocalFile } from "../utils/streamLocalFile.js";

const videoContentType = (absolutePath) => {
  const ext = path.extname(String(absolutePath)).toLowerCase();
  const types = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
  };
  return types[ext] || "video/mp4";
};

const safeJoin = (root, subdir, requestPath) => {
  const decoded = decodeURIComponent(String(requestPath || "").split("?")[0]);
  const trimmed = decoded.replace(/^[/\\]+/, "");
  const normalized = path.normalize(trimmed).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = path.resolve(path.join(root, subdir, normalized));
  const base = path.resolve(path.join(root, subdir));
  if (!absolute.startsWith(base)) return null;
  return absolute;
};

/** Serve local media from the configured drive (updates when storage location changes). */
export const createLocalMediaStaticHandler = (subdir) => (req, res, next) => {
  if (!LOCAL_MEDIA_SUBDIRS.includes(subdir)) {
    return res.status(404).end();
  }

  const absolute = safeJoin(getLocalMediaRoot(), subdir, req.path);
  if (!absolute || !fs.existsSync(absolute)) {
    return next();
  }

  const isVideo = /\.(mp4|webm|mkv|mov|m4v)$/i.test(absolute);
  if (isVideo) {
    const ext = path.extname(absolute).toLowerCase();
    const videoTypes = {
      ".mp4": "video/mp4",
      ".m4v": "video/mp4",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
      ".mov": "video/quicktime",
    };
    streamLocalFile({
      req,
      res,
      absolutePath: absolute,
      contentType: videoTypes[ext] || "video/mp4",
      fileName: path.basename(absolute),
      asAttachment: false,
    });
    return;
  }

  res.sendFile(absolute, (error) => {
    if (error) next(error);
  });
};

/** Files placed directly in CDS UPLOAD root (not in _merged_subjects etc.). */
export const createLocalMediaRootStaticHandler = () => (req, res, next) => {
  if (!isUsingCustomLocalMediaRoot()) return next();

  const decoded = decodeURIComponent(String(req.path || "").split("?")[0]);
  const trimmed = decoded.replace(/^[/\\]+/, "");
  if (!trimmed || trimmed.includes("..")) return next();

  const firstSegment = trimmed.split(/[/\\]/)[0];
  if (LOCAL_MEDIA_SUBDIRS.includes(firstSegment)) return next();

  const root = path.resolve(getLocalMediaRoot());
  const absolute = path.resolve(path.join(root, trimmed));
  if (!absolute.startsWith(root) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return next();
  }

  if (/\.(mp4|webm|mkv|mov|m4v)$/i.test(absolute)) {
    streamLocalFile({
      req,
      res,
      absolutePath: absolute,
      contentType: videoContentType(absolute),
      fileName: path.basename(absolute),
      asAttachment: false,
    });
    return;
  }

  res.sendFile(absolute, (error) => {
    if (error) next(error);
  });
};

export default createLocalMediaStaticHandler;
