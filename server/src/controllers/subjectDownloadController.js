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
  buildSubjectMergedVideo,
  downloadSubjectMergeParts,
  getMergedVideoAbsolutePath,
  getMergedVideoDownloadName,
  getSubjectMergedVideoStatus,
  getSubjectFullVideoPlaylist,
  stitchSubjectMergedVideo,
} from "../services/subjectMergeService.js";
import { getActiveSession } from "../services/telegramService.js";
import { formatBytesLabel, isTelegramStreamContent } from "../utils/contentPlayback.js";
import { streamLocalFile } from "../utils/streamLocalFile.js";

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
    const status = await getSubjectMergedVideoStatus(req.params.id);
    if (!status) return res.status(404).json({ message: "Subject not found" });
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read merge status" });
  }
};

export const getSubjectFullVideoPlaylistHandler = async (req, res) => {
  try {
    const playlist = await getSubjectFullVideoPlaylist(req.params.id, {
      apiBase: resolveApiBase(req),
      token: resolveAuthToken(req),
    });
    if (!playlist) return res.status(404).json({ message: "Subject not found" });
    res.json(playlist);
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not build full course playlist" });
  }
};

export const startSubjectMergedVideoHandler = async (req, res) => {
  try {
    const { uploadId } = req.body || {};
    const subjectId = req.params.id;

    const run = () => buildSubjectMergedVideo(subjectId, uploadId);

    if (uploadId) {
      res.status(202).json({ uploadId, message: "Building full subject video…" });
      run().catch((error) => {
        console.error("[subject-merge]", error.message || error);
      });
      return;
    }

    const result = await run();
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not build merged video" });
  }
};

const startAsyncMergeJob = (res, uploadId, message, run) => {
  if (uploadId) {
    res.status(202).json({ uploadId, message });
    run().catch((error) => {
      console.error("[subject-merge]", error.message || error);
    });
    return true;
  }
  return false;
};

export const downloadSubjectMergePartsHandler = async (req, res) => {
  try {
    const { uploadId } = req.body || {};
    const subjectId = req.params.id;
    const run = () => downloadSubjectMergeParts(subjectId, uploadId);

    if (startAsyncMergeJob(res, uploadId, "Downloading all chapters…", run)) return;

    const result = await run();
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not download chapters" });
  }
};

export const stitchSubjectMergedVideoHandler = async (req, res) => {
  try {
    const { uploadId } = req.body || {};
    const subjectId = req.params.id;
    const run = () => stitchSubjectMergedVideo(subjectId, uploadId);

    if (startAsyncMergeJob(res, uploadId, "Stitching chapters into one video…", run)) return;

    const result = await run();
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not stitch merged video" });
  }
};

export const streamSubjectMergedVideoHandler = async (req, res) => {
  try {
    const absolute = await getMergedVideoAbsolutePath(req.params.id);
    if (!absolute) {
      return res.status(404).json({ message: "Merged video not ready. Build it first." });
    }
    const fileName = await getMergedVideoDownloadName(req.params.id);
    streamLocalFile({
      req,
      res,
      absolutePath: absolute,
      contentType: "video/mp4",
      fileName,
      asAttachment: false,
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: error.message || "Stream failed" });
    }
  }
};

export const downloadSubjectMergedVideoHandler = async (req, res) => {
  try {
    const absolute = await getMergedVideoAbsolutePath(req.params.id);
    if (!absolute) {
      return res.status(404).json({ message: "Merged video not ready. Build it first." });
    }
    const fileName = await getMergedVideoDownloadName(req.params.id);
    streamLocalFile({
      req,
      res,
      absolutePath: absolute,
      contentType: "video/mp4",
      fileName,
      asAttachment: true,
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: error.message || "Download failed" });
    }
  }
};
