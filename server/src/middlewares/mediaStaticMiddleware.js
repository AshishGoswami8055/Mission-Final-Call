import path from "node:path";
import fs from "node:fs";
import { getLocalMediaRoot, LOCAL_MEDIA_SUBDIRS } from "../config/mediaStorage.js";
import { streamLocalFile } from "../utils/streamLocalFile.js";

const safeJoin = (root, subdir, requestPath) => {
  const decoded = decodeURIComponent(String(requestPath || "").split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = path.resolve(root, subdir, normalized);
  const base = path.resolve(root, subdir);
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

export default createLocalMediaStaticHandler;
