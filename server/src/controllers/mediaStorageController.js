import { formatBytesLabel } from "../utils/contentPlayback.js";
import { isLocalLibraryEnabled } from "../services/localLibraryService.js";
import {
  clearStreamCache,
  getStreamCacheInventory,
  revealStreamCacheFolderOnDisk,
  revealStreamCacheItemOnDisk,
} from "../services/telegramStreamCacheService.js";
import {
  getLocalMediaStorageStatusAsync,
  setLocalMediaRoot,
} from "../config/mediaStorage.js";

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

export const getStreamCacheHandler = async (_req, res) => {
  try {
    const inventory = await getStreamCacheInventory();
    res.json({
      ...inventory,
      usedLabel: formatBytesLabel(inventory.usedBytes),
      items: inventory.items.map((item) => ({
        ...item,
        totalLabel: formatBytesLabel(item.totalSize),
        cachedLabel: formatBytesLabel(item.cachedBytes),
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read stream cache" });
  }
};

export const clearStreamCacheHandler = async (req, res) => {
  try {
    const cacheKey = req.query.cacheKey ? String(req.query.cacheKey) : null;
    const result = clearStreamCache({ cacheKey });
    const inventory = await getStreamCacheInventory();
    res.json({
      ...result,
      ...inventory,
      usedLabel: formatBytesLabel(inventory.usedBytes),
      message: cacheKey ? "Removed cached video." : "Stream cache cleared.",
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

export { assertLocalMediaSettings };
