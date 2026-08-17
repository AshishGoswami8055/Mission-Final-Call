import { formatBytesLabel } from "../utils/contentPlayback.js";
import { isLocalLibraryEnabled } from "../services/localLibraryService.js";
import {
  clearStreamCache,
  getStreamCacheInventory,
  migrateStreamCacheLayouts,
  reconcileStreamCacheFolder,
  revealStreamCacheFolderOnDisk,
  revealStreamCacheItemOnDisk,
} from "../services/telegramStreamCacheService.js";
import {
  getLocalMediaStorageStatusAsync,
  setLocalMediaRoot,
} from "../config/mediaStorage.js";

const enrichStreamCacheInventory = async (inventory, userId) => {
  const contentIds = inventory.items.map((item) => item.contentId).filter(Boolean);
  let completedSet = new Set();

  if (contentIds.length && userId) {
    const Progress = (await import("../models/Progress.js")).default;
    const completed = await Progress.find({
      userId,
      contentId: { $in: contentIds },
      completed: true,
    }).select("contentId");
    completedSet = new Set(completed.map((entry) => String(entry.contentId)));
  }

  return {
    ...inventory,
    usedLabel: formatBytesLabel(inventory.usedBytes),
    items: inventory.items.map((item) => ({
      ...item,
      totalLabel: formatBytesLabel(item.totalSize),
      cachedLabel: formatBytesLabel(item.cachedBytes),
      completed: item.contentId ? completedSet.has(String(item.contentId)) : false,
    })),
  };
};

const assertLocalMediaSettings = (req, res, next) => {
  if (!isLocalLibraryEnabled()) {
    return res.status(403).json({
      message: "PC media storage settings are only available on the local study server.",
    });
  }
  next();
};

export const getLocalMediaStorageHandler = async (_req, res) => {
  try {
    const status = await getLocalMediaStorageStatusAsync();
    res.json({
      ...status,
      usedLabel: formatBytesLabel(status.usedBytes),
      libraryLabel: formatBytesLabel(status.libraryBytes),
      mergedLabel: formatBytesLabel(status.mergedBytes),
      cacheLabel: formatBytesLabel(status.cacheBytes),
      streamCacheLabel: formatBytesLabel(status.streamCacheBytes || 0),
      volume: status.volume
        ? {
            ...status.volume,
            freeLabel:
              status.volume.freeBytes != null ? formatBytesLabel(status.volume.freeBytes) : null,
            totalLabel:
              status.volume.totalBytes != null ? formatBytesLabel(status.volume.totalBytes) : null,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read media storage settings" });
  }
};

export const updateLocalMediaStorageHandler = async (req, res) => {
  try {
    if (req.body?.envOverride) {
      return res.status(400).json({
        message:
          "LOCAL_MEDIA_ROOT is set in server/.env and overrides the app setting. Remove or change it there.",
      });
    }

    const { rootPath, migrate = false } = req.body || {};
    const result = setLocalMediaRoot({ rootPath, migrate: Boolean(migrate) });
    const status = await getLocalMediaStorageStatusAsync();

    res.json({
      ...status,
      usedLabel: formatBytesLabel(status.usedBytes),
      libraryLabel: formatBytesLabel(status.libraryBytes),
      mergedLabel: formatBytesLabel(status.mergedBytes),
      cacheLabel: formatBytesLabel(status.cacheBytes),
      streamCacheLabel: formatBytesLabel(status.streamCacheBytes || 0),
      migration: result.migration
        ? {
            ...result.migration,
            bytesLabel: formatBytesLabel(result.migration.bytes),
          }
        : null,
      message: result.migration?.files
        ? `Storage location updated. Copied ${result.migration.files} file(s) to the new drive.`
        : "Storage location updated. New downloads will use the new folder.",
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not update media storage location" });
  }
};

export const getStreamCacheHandler = async (req, res) => {
  try {
    const inventory = await getStreamCacheInventory();
    const payload = await enrichStreamCacheInventory(inventory, req.user?._id);
    res.json({
      ...payload,
      sync: payload.sync
        ? {
            ...payload.sync,
            freedLabel: formatBytesLabel(payload.sync.freedBytes || 0),
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read stream cache" });
  }
};

export const syncStreamCacheHandler = async (req, res) => {
  try {
    const migration = await migrateStreamCacheLayouts();
    const sync = reconcileStreamCacheFolder();
    const inventory = await getStreamCacheInventory();
    const payload = await enrichStreamCacheInventory(inventory, req.user?._id);
    res.json({
      ...payload,
      sync: {
        ...sync,
        freedLabel: formatBytesLabel(sync.freedBytes || 0),
      },
      migration,
      message:
        migration.migrated > 0
          ? `Organized ${migration.migrated} cached video(s) into subject folders.`
          : sync.removedFiles
            ? `Removed ${sync.removedFiles} orphan file(s) and freed ${formatBytesLabel(sync.freedBytes)}.`
            : "Stream cache folder is already organized and in sync.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not sync stream cache" });
  }
};

export const clearStreamCacheHandler = async (req, res) => {
  try {
    const cacheKey = req.query.cacheKey ? String(req.query.cacheKey) : null;
    const cacheKeys = Array.isArray(req.body?.cacheKeys)
      ? req.body.cacheKeys.map((key) => String(key).trim()).filter(Boolean)
      : null;
    const result = clearStreamCache({ cacheKey, cacheKeys });
    const inventory = await getStreamCacheInventory();
    const payload = await enrichStreamCacheInventory(inventory, req.user?._id);
    const clearedCount = typeof result.cleared === "number" ? result.cleared : 0;
    res.json({
      ...result,
      ...payload,
      message: cacheKeys?.length
        ? `Removed ${clearedCount} cached video(s).`
        : cacheKey
          ? "Removed cached video."
          : "Stream cache cleared.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not clear stream cache" });
  }
};

export const revealStreamCacheItemHandler = async (req, res) => {
  try {
    const cacheKey = String(req.params.cacheKey || "").trim();
    const result = await revealStreamCacheItemOnDisk(cacheKey);
    res.json({
      ...result,
      message: "Opened in File Explorer.",
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not open file location" });
  }
};

export const revealStreamCacheFolderHandler = async (_req, res) => {
  try {
    const result = await revealStreamCacheFolderOnDisk();
    res.json({
      ...result,
      message: "Opened stream cache folder.",
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not open folder" });
  }
};

export const getYoutubeCookiesHandler = async (_req, res) => {
  try {
    const { getYoutubeCookiesStatus } = await import("../services/youtubeDownloadService.js");
    res.json(getYoutubeCookiesStatus());
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read YouTube cookies status" });
  }
};

export const uploadYoutubeCookiesHandler = async (req, res) => {
  try {
    const { saveYoutubeCookiesFile } = await import("../services/youtubeDownloadService.js");
    const body = req.file?.buffer
      ? req.file.buffer.toString("utf8")
      : String(req.body?.cookiesText || "");
    const status = saveYoutubeCookiesFile(body);
    res.json({
      ...status,
      message: "YouTube cookies saved. Refresh the video page to retry the full-quality download.",
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not save YouTube cookies" });
  }
};

export { assertLocalMediaSettings };
