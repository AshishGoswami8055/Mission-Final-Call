import {
  getSubjectLocalLibraryStatus,
  getSubjectCachedContentIds,
  isLocalLibraryEnabled,
  startSubjectLocalLibraryDownload,
} from "../services/localLibraryService.js";
import {
  getSubjectDownloadPack,
  getSubjectLibraryVideos,
} from "../services/subjectDownloadService.js";
import {
  getFullCourseAbsolutePath,
  getFullCourseDownloadName,
  getSubjectFullCourseStatus,
  linkSubjectFullCourseFromPath,
  registerSubjectFullCourse,
  revealSubjectFullCourse,
} from "../services/subjectFullCourseService.js";
import { getActiveSession } from "../services/telegramService.js";
import { formatBytesLabel, isTelegramStreamContent } from "../utils/contentPlayback.js";
import { streamLocalFile } from "../utils/streamLocalFile.js";
import fs from "node:fs";
import path from "node:path";

const videoContentType = (absolutePath = "") => {
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

const assertLocalLibrary = (_req, res, next) => {
  if (!isLocalLibraryEnabled()) {
    return res.status(403).json({
      message: "Subject PC library is only available on the local study server.",
    });
  }
  next();
};

const resolveApiBase = (req) => {
  const configured = String(process.env.API_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) return `${configured}/api`;
  return `${req.protocol}://${req.get("host")}/api`;
};

const resolveAuthToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.split(" ")[1];
  return req.query?.token || null;
};

export const getSubjectDownloadPackHandler = async (req, res) => {
  try {
    const pack = await getSubjectDownloadPack(req.params.id, {
      apiBase: resolveApiBase(req),
      token: resolveAuthToken(req),
    });
    if (!pack) return res.status(404).json({ message: "Subject not found" });
    res.json(pack);
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not build download list" });
  }
};

export const getSubjectLocalLibraryHandler = async (req, res) => {
  try {
    const status = getSubjectLocalLibraryStatus(req.params.id);
    res.json({
      ...status,
      storage: {
        ...status.storage,
        usedLabel: formatBytesLabel(status.storage.usedBytes),
        maxLabel: status.storage.maxBytes > 0 ? formatBytesLabel(status.storage.maxBytes) : null,
        freeLabel:
          status.storage.freeBytes != null ? formatBytesLabel(status.storage.freeBytes) : null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read subject library status" });
  }
};

export const getSubjectCachedLibraryIdsHandler = async (req, res) => {
  try {
    const cachedIds = await getSubjectCachedContentIds(req.params.id);
    res.json({ cachedIds, total: cachedIds.length });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read PC library cache" });
  }
};

export const startSubjectLocalLibraryHandler = async (req, res) => {
  try {
    const pack = await getSubjectLibraryVideos(req.params.id);
    if (!pack) return res.status(404).json({ message: "Subject not found" });
    if (!pack.eligibleCount) {
      return res.status(400).json({ message: "No downloadable videos in this subject." });
    }

    const needsTelegram = pack.videos.some((video) => isTelegramStreamContent(video));
    if (needsTelegram) {
      const session = await getActiveSession();
      if (!session?.stringSession) {
        return res.status(400).json({
          message: "Log in to Telegram first (Telegram settings in the app) before downloading this subject.",
        });
      }
    }

    const status = await startSubjectLocalLibraryDownload(req.params.id, pack.videos);
    res.json({
      ...status,
      subjectName: pack.subjectName,
      storage: {
        ...status.storage,
        usedLabel: formatBytesLabel(status.storage.usedBytes),
        maxLabel: status.storage.maxBytes > 0 ? formatBytesLabel(status.storage.maxBytes) : null,
        freeLabel:
          status.storage.freeBytes != null ? formatBytesLabel(status.storage.freeBytes) : null,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not start subject download" });
  }
};

export { assertLocalLibrary as assertSubjectLocalLibrary };

export const getSubjectMergedVideoStatusHandler = async (req, res) => {
  try {
    const status = await getSubjectFullCourseStatus(req.params.id);
    if (!status) return res.status(404).json({ message: "Subject not found" });
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read full course status" });
  }
};

export const streamSubjectMergedVideoHandler = async (req, res) => {
  try {
    const absolute = await getFullCourseAbsolutePath(req.params.id);
    if (!absolute) {
      return res.status(404).json({ message: "No full course video linked. Use Replace full course first." });
    }
    const fileName = await getFullCourseDownloadName(req.params.id);
    streamLocalFile({
      req,
      res,
      absolutePath: absolute,
      contentType: videoContentType(absolute),
      fileName,
      asAttachment: false,
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: error.message || "Stream failed" });
    }
  }
};

export const revealSubjectMergedVideoHandler = async (req, res) => {
  try {
    const result = await revealSubjectFullCourse(req.params.id);
    res.json({
      ...result,
      message: result.revealed === "file" ? "Opened in File Explorer." : result.message,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not open file location" });
  }
};

export const replaceSubjectMergedVideoHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No video file selected." });
    }

    const status = await registerSubjectFullCourse(req.params.id, {
      uploadedPath: req.file.path,
      originalName: req.file.originalname,
    });

    res.json({
      ...status,
      replaced: true,
      message: "Full course video linked from your PC.",
    });
  } catch (error) {
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    }
    res.status(400).json({ message: error.message || "Could not link full course video" });
  }
};

export const linkLocalFullCourseHandler = async (req, res) => {
  try {
    const { filePath, originalName } = req.body || {};
    if (!String(filePath || "").trim()) {
      return res.status(400).json({ message: "Paste the full path to your MP4 file." });
    }

    const status = await linkSubjectFullCourseFromPath(req.params.id, filePath, { originalName });
    res.json({
      ...status,
      linked: true,
      message: "Full course video linked — no upload needed.",
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not link full course video" });
  }
};
