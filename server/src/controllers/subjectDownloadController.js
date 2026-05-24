import {
  getSubjectLocalLibraryStatus,
  isLocalLibraryEnabled,
  startSubjectLocalLibraryDownload,
} from "../services/localLibraryService.js";
import {
  getSubjectDownloadPack,
  getSubjectLibraryVideos,
} from "../services/subjectDownloadService.js";
import { getActiveSession } from "../services/telegramService.js";
import { formatBytesLabel, isTelegramStreamContent } from "../utils/contentPlayback.js";

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
