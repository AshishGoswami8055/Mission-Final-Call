import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
import { applyCorsHeaders } from "../config/cors.js";
import { ensureLocalMediaDirs, getStreamCacheDir, toMediaWebPath } from "../config/mediaStorage.js";
import {
  buildStreamCacheLayout,
  collectStreamCacheMetaFiles,
  ensureStreamCacheLayout,
  measureStreamCacheUsedBytes,
  migrateStreamCacheLayouts,
  pathsFromLayout,
  readMetaAtPath,
  reconcileStreamCacheFolder,
  removeStreamCacheFiles,
  resolveStreamCachePaths,
  streamCacheWebRelPath,
} from "../utils/streamCachePaths.js";
import {
  beginTelegramPlayback,
  beginTelegramStreamWait,
  endTelegramPlayback,
  endTelegramStreamWait,
  isTelegramStreamWaiting,
  withTelegramLock,
  withTelegramPlaybackLock,
} from "./telegramService.js";

const require = createRequire(import.meta.url);
const bigInt = require("big-integer");

const isLocalhostStudy = () => process.env.NODE_ENV !== "production";

const defaultChunkKb = () => (isLocalhostStudy() ? 4096 : 2048);
const defaultTailMb = () => (isLocalhostStudy() ? 16 : 8);

const CHUNK_SIZE = Math.max(
  256 * 1024,
  Number(process.env.TELEGRAM_STREAM_CHUNK_KB || defaultChunkKb()) * 1024
);
const MAP_CHUNK = 256 * 1024;
const MAX_WAIT_MS = Math.max(5000, Number(process.env.TELEGRAM_STREAM_WAIT_MS || 45000));
const WARMUP_DELAY_MS = Math.max(
  3000,
  Number(process.env.TELEGRAM_STREAM_WARMUP_DELAY_MS || (isLocalhostStudy() ? 5000 : 12000))
);
const PRIORITY_TAIL_BYTES = Math.max(
  2 * 1024 * 1024,
  Number(process.env.TELEGRAM_STREAM_TAIL_MB || defaultTailMb()) * 1024 * 1024
);
const PREFETCH_AHEAD_BYTES = Math.max(
  2 * 1024 * 1024,
  Number(process.env.TELEGRAM_STREAM_PREFETCH_MB || (isLocalhostStudy() ? 32 : 16)) * 1024 * 1024
);
const PREFETCH_SLICE_BYTES = Math.max(
  512 * 1024,
  Number(process.env.TELEGRAM_STREAM_PREFETCH_SLICE_MB || 2) * 1024 * 1024
);
const MAX_STREAM_FETCH_BYTES = Math.max(
  2 * 1024 * 1024,
  Number(process.env.TELEGRAM_STREAM_FETCH_MB || (isLocalhostStudy() ? 8 : 4)) * 1024 * 1024
);

const cacheEnabled = () => String(process.env.TELEGRAM_STREAM_CACHE ?? "1") !== "0";

/** @type {Map<string, object>} */
const entries = new Map();

const cacheKeyFor = (channelId, messageId) => `${channelId}_${messageId}`;
const metaPathFor = (cacheKey) => resolveStreamCachePaths(cacheKey).metaPath;
const binPathFor = (cacheKey) => resolveStreamCachePaths(cacheKey).binPath;
const mp4PathFor = (cacheKey) => resolveStreamCachePaths(cacheKey).mp4Path;

export { reconcileStreamCacheFolder, measureStreamCacheUsedBytes, migrateStreamCacheLayouts };

/** Hard-link complete cache to .mp4 so browsers stream it reliably from /uploads. */
const ensureStreamCacheMp4Link = (cacheKey) => {
  const binPath = binPathFor(cacheKey);
  const mp4Path = mp4PathFor(cacheKey);
  if (!fs.existsSync(binPath)) return false;

  if (fs.existsSync(mp4Path)) {
    try {
      const binSize = fs.statSync(binPath).size;
      const mp4Size = fs.statSync(mp4Path).size;
      if (mp4Size === binSize && mp4Size > 0) return true;
    } catch {
      /* recreate below */
    }
  }

  try {
    if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
    fs.linkSync(binPath, mp4Path);
    return true;
  } catch {
    try {
      fs.copyFileSync(binPath, mp4Path);
      return true;
    } catch {
      return false;
    }
  }
};

const parseRangeHeader = (rangeHeader, totalSize) => {
  if (!rangeHeader || !/^bytes=/i.test(rangeHeader)) {
    return { start: 0, end: totalSize - 1, partial: false };
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
  if (!match) return { start: 0, end: totalSize - 1, partial: false };
  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
    return { invalid: true };
  }
  end = Math.min(end, totalSize - 1);
  return { start, end, partial: true };
};

const chunkIndexFor = (offset) => Math.floor(offset / MAP_CHUNK);

const createChunkMap = (totalSize) => ({
  totalChunks: Math.max(1, Math.ceil(totalSize / MAP_CHUNK)),
  filled: new Uint8Array(Math.max(1, Math.ceil(totalSize / MAP_CHUNK))),
});

const markRangeFilled = (entry, start, length) => {
  if (!length) return;
  const end = start + length - 1;
  const from = chunkIndexFor(start);
  const to = chunkIndexFor(end);
  for (let i = from; i <= to; i += 1) {
    entry.chunkMap.filled[i] = 1;
  }
  let contiguous = 0;
  while (contiguous < entry.chunkMap.totalChunks && entry.chunkMap.filled[contiguous]) {
    contiguous += 1;
  }
  entry.contiguousBytes = Math.min(entry.totalSize, contiguous * MAP_CHUNK);
};

const isRangeCached = (entry, start, end) => {
  const from = chunkIndexFor(start);
  const to = chunkIndexFor(end);
  for (let i = from; i <= to; i += 1) {
    if (!entry.chunkMap.filled[i]) return false;
  }
  return true;
};

/** Largest byte offset we can serve from cache within [start, maxEnd]. */
const findCachedEndWithin = (entry, start, maxEnd) => {
  if (start > maxEnd || !isRangeCached(entry, start, start)) return -1;
  const limitChunk = chunkIndexFor(maxEnd);
  let chunk = chunkIndexFor(start);
  while (chunk <= limitChunk && entry.chunkMap.filled[chunk]) {
    chunk += 1;
  }
  return Math.min(maxEnd, chunk * MAP_CHUNK - 1);
};

const capFetchEnd = (entry, start, end) => {
  if (entry.complete) return end;
  return Math.min(end, start + MAX_STREAM_FETCH_BYTES - 1);
};

const loadMeta = (cacheKey) => {
  const metaPath = metaPathFor(cacheKey);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
};

const saveMeta = (entry) => {
  ensureLocalMediaDirs();
  const paths = resolveStreamCachePaths(entry.cacheKey);
  fs.mkdirSync(paths.dir, { recursive: true });
  if (entry.complete) {
    ensureStreamCacheMp4Link(entry.cacheKey);
  }
  fs.writeFileSync(
    paths.metaPath,
    JSON.stringify({
      cacheKey: entry.cacheKey,
      channelId: entry.channelId,
      messageId: entry.messageId,
      totalSize: entry.totalSize,
      mimeType: entry.mimeType,
      fileName: entry.fileName,
      storageRelDir: paths.storageRelDir,
      storageBaseName: paths.storageBaseName,
      title: entry.title || null,
      subjectName: entry.subjectName || null,
      contentId: entry.contentId || null,
      contiguousBytes: entry.contiguousBytes,
      complete: entry.complete,
      lastAccessAt: entry.lastAccessAt,
      chunkMap: Buffer.from(entry.chunkMap.filled).toString("base64"),
    })
  );
};

const restoreEntry = (cacheKey, meta) => {
  const chunkMap = createChunkMap(meta.totalSize);
  if (meta.chunkMap) {
    try {
      const buf = Buffer.from(meta.chunkMap, "base64");
      chunkMap.filled.set(buf.subarray(0, chunkMap.filled.length));
    } catch {
      /* ignore corrupt map */
    }
  }
  return {
    cacheKey,
    channelId: meta.channelId,
    messageId: meta.messageId,
    totalSize: meta.totalSize,
    mimeType: meta.mimeType,
    fileName: meta.fileName,
    binPath: resolveStreamCachePaths(cacheKey).binPath,
    chunkMap,
    contiguousBytes: meta.contiguousBytes || 0,
    complete: Boolean(meta.complete),
    lastAccessAt: meta.lastAccessAt || Date.now(),
    waiters: [],
    queue: [],
    workerRunning: false,
    warmupTimer: null,
    playbackActive: 0,
    prefetchRunning: false,
    prefetchRetryTimer: null,
  };
};

/** @type {Map<string, object|null>} */
const streamContentMetaCache = new Map();

const resolveStreamCacheContentMeta = async (channelId, messageId) => {
  const lookupKey = `${channelId}_${messageId}`;
  if (streamContentMetaCache.has(lookupKey)) {
    return streamContentMetaCache.get(lookupKey);
  }

  try {
    const Content = (await import("../models/Content.js")).default;
    const row = await Content.findOne({
      telegramChannelId: String(channelId),
      telegramMessageId: Number(messageId),
    })
      .select("_id title subjectId")
      .populate("subjectId", "name")
      .lean();

    const contentMeta = row
      ? {
          contentId: String(row._id),
          title: row.title,
          subjectName: row.subjectId?.name || null,
        }
      : null;
    streamContentMetaCache.set(lookupKey, contentMeta);
    return contentMeta;
  } catch {
    streamContentMetaCache.set(lookupKey, null);
    return null;
  }
};

const getOrCreateEntry = ({ cacheKey, channelId, messageId, meta, contentMeta = null }) => {
  let entry = entries.get(cacheKey);
  if (entry) {
    entry.lastAccessAt = Date.now();
    return entry;
  }

  const saved = loadMeta(cacheKey);
  if (saved && saved.totalSize === meta.size) {
    entry = restoreEntry(cacheKey, saved);
    entries.set(cacheKey, entry);
    entry.lastAccessAt = Date.now();
    return entry;
  }

  entry = {
    cacheKey,
    channelId,
    messageId,
    totalSize: meta.size,
    mimeType: meta.mimeType,
    fileName: meta.fileName,
    title: contentMeta?.title || null,
    subjectName: contentMeta?.subjectName || null,
    contentId: contentMeta?.contentId || null,
    binPath: (() => {
      const layout = buildStreamCacheLayout({
        cacheKey,
        subjectName: contentMeta?.subjectName,
        title: contentMeta?.title,
        fileName: meta.fileName,
      });
      const paths = pathsFromLayout(layout);
      fs.mkdirSync(paths.dir, { recursive: true });
      return paths.binPath;
    })(),
    chunkMap: createChunkMap(meta.size),
    contiguousBytes: 0,
    complete: false,
    lastAccessAt: Date.now(),
    waiters: [],
    queue: [],
    workerRunning: false,
    warmupTimer: null,
    playbackActive: 0,
    prefetchRunning: false,
    prefetchRetryTimer: null,
  };
  entries.set(cacheKey, entry);
  return entry;
};

const beginEntryPlayback = (entry) => {
  entry.playbackActive = (entry.playbackActive || 0) + 1;
  beginTelegramPlayback();
};

const endEntryPlayback = (entry) => {
  entry.playbackActive = Math.max(0, (entry.playbackActive || 0) - 1);
  endTelegramPlayback();
};

const findNextUncachedStart = (entry, from = 0) => {
  const startAt = Math.max(0, Number(from) || 0);
  for (let start = startAt; start < entry.totalSize; start += MAP_CHUNK) {
    const end = Math.min(entry.totalSize - 1, start + PREFETCH_AHEAD_BYTES - 1);
    if (!isRangeCached(entry, start, end)) return start;
  }
  return entry.totalSize;
};

const hasPrefetchActive = (entry) =>
  Boolean(entry.prefetchRunning) || entry.queue.some((task) => task.kind === "prefetch");

/** Prefer filling the sequential front gap so cache % climbs steadily. */
const resolvePrefetchStart = (entry, hintStart = null) => {
  const fromFront = findNextUncachedStart(entry, entry.contiguousBytes);
  if (fromFront < entry.totalSize) return fromFront;
  if (hintStart != null) {
    const fromHint = findNextUncachedStart(entry, hintStart);
    if (fromHint < entry.totalSize) return fromHint;
  }
  return entry.totalSize;
};

const retryPrefetch = (entry, delayMs = 3000) => {
  if (entry.complete || entry.prefetchRetryTimer) return;
  entry.prefetchRetryTimer = setTimeout(() => {
    entry.prefetchRetryTimer = null;
    scheduleAheadPrefetch(entry, entry.contiguousBytes);
  }, delayMs);
};

/** Download the next uncached window so cache keeps growing during playback. */
const scheduleAheadPrefetch = (entry, hintStart = null) => {
  if (entry.complete || hasPrefetchActive(entry)) return;

  const start = resolvePrefetchStart(entry, hintStart);
  if (start >= entry.totalSize) {
    if (entry.contiguousBytes >= entry.totalSize) {
      entry.complete = true;
      saveMeta(entry);
      notifyWaiters(entry);
    }
    return;
  }

  const end = Math.min(entry.totalSize - 1, start + PREFETCH_AHEAD_BYTES - 1);
  enqueueTask(entry, {
    priority: 1,
    kind: "prefetch",
    run: async () => {
      if (entry.complete) return;
      entry.prefetchRunning = true;
      try {
        const { client, message } = await taskGetMedia(entry.channelId, entry.messageId);
        await downloadRangeToCache({
          entry,
          client,
          message,
          start,
          end,
          res: null,
          writeResponse: false,
        });
      } catch (error) {
        console.warn("[telegram-cache] prefetch error:", error.message);
        retryPrefetch(entry);
        return;
      } finally {
        entry.prefetchRunning = false;
      }

      if (entry.contiguousBytes >= entry.totalSize) {
        entry.complete = true;
        saveMeta(entry);
        notifyWaiters(entry);
        return;
      }

      scheduleAheadPrefetch(entry, end + 1);
    },
  });
};

const runBackgroundWarmup = (entry) => {
  if (entry.complete) return;

  enqueueTask(entry, {
    priority: 0,
    kind: "tail",
    run: async () => {
      if (entry.complete) return;
      const { client, message } = await taskGetMedia(entry.channelId, entry.messageId);
      const tailStart = Math.max(0, entry.totalSize - PRIORITY_TAIL_BYTES);
      if (!isRangeCached(entry, tailStart, entry.totalSize - 1)) {
        await downloadRangeToCache({
          entry,
          client,
          message,
          start: tailStart,
          end: entry.totalSize - 1,
          res: null,
          writeResponse: false,
        });
      }
    },
  });

  enqueueTask(entry, {
    priority: 0,
    kind: "fill",
    run: async () => {
      if (entry.complete) return;
      const { client, message } = await taskGetMedia(entry.channelId, entry.messageId);
      const start = findNextUncachedStart(entry, entry.contiguousBytes);
      if (start >= entry.totalSize) {
        if (entry.contiguousBytes >= entry.totalSize) {
          entry.complete = true;
          saveMeta(entry);
          notifyWaiters(entry);
        }
        return;
      }
      await downloadRangeToCache({
        entry,
        client,
        message,
        start,
        end: entry.totalSize - 1,
        res: null,
        writeResponse: false,
      });
      if (entry.contiguousBytes >= entry.totalSize) {
        entry.complete = true;
        saveMeta(entry);
        notifyWaiters(entry);
      } else {
        scheduleAheadPrefetch(entry);
      }
    },
  });
};

/** Prefetch immediately; run full gap-fill when playback is idle. */
const deferBackgroundWarmup = (entry, hintStart = null) => {
  if (entry.complete) return;
  scheduleAheadPrefetch(entry, hintStart);
  if (entry.playbackActive > 0) return;
  if (entry.warmupTimer) return;
  entry.warmupTimer = setTimeout(() => {
    entry.warmupTimer = null;
    runBackgroundWarmup(entry);
  }, WARMUP_DELAY_MS);
};

const resolveEntryFromDisk = (cacheKey, channelId, messageId) => {
  let entry = entries.get(cacheKey);
  if (entry) {
    entry.lastAccessAt = Date.now();
    return entry;
  }
  const saved = loadMeta(cacheKey);
  if (!saved) return null;
  entry = restoreEntry(cacheKey, saved);
  entries.set(cacheKey, entry);
  entry.lastAccessAt = Date.now();
  return entry;
};

const ensureBinFile = (entry) => {
  ensureLocalMediaDirs();
  if (!fs.existsSync(entry.binPath)) {
    const fd = fs.openSync(entry.binPath, "w");
    try {
      fs.ftruncateSync(fd, entry.totalSize);
    } finally {
      fs.closeSync(fd);
    }
  }
};

const notifyWaiters = (entry) => {
  const pending = [];
  for (const waiter of entry.waiters) {
    if (waiter.aborted) {
      waiter.reject(new Error("aborted"));
      continue;
    }
    if (isRangeCached(entry, waiter.start, waiter.end) || entry.complete) {
      waiter.resolve();
    } else {
      pending.push(waiter);
    }
  }
  entry.waiters = pending;
};

const waitForCachedRange = (entry, start, end, req) =>
  new Promise((resolve, reject) => {
    if (isRangeCached(entry, start, end) || entry.complete) {
      resolve();
      return;
    }
    const waiter = { start, end, resolve, reject, aborted: false };
    entry.waiters.push(waiter);
    const onClose = () => {
      waiter.aborted = true;
      reject(new Error("client closed"));
    };
    req.on("close", onClose);
    const deadline = Date.now() + MAX_WAIT_MS;
    const tick = () => {
      if (waiter.aborted) return;
      if (isRangeCached(entry, start, end) || entry.complete) {
        req.off("close", onClose);
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        req.off("close", onClose);
        const idx = entry.waiters.indexOf(waiter);
        if (idx >= 0) entry.waiters.splice(idx, 1);
        reject(new Error("cache wait timeout"));
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  });

const writeWithBackpressure = (writable, chunk) =>
  new Promise((resolve, reject) => {
    if (writable.destroyed || writable.writableEnded) return resolve();
    const ok = writable.write(chunk, (err) => {
      if (err) reject(err);
    });
    if (ok) return resolve();
    writable.once("drain", resolve);
    writable.once("error", reject);
  });

let getMediaRef = null;

const taskGetMedia = async (channelId, messageId) => {
  if (!getMediaRef) throw new Error("Telegram cache is not initialized.");
  return getMediaRef({ channelId, messageId });
};

const downloadRangeSlice = async ({
  entry,
  client,
  message,
  start,
  end,
  res,
  writeResponse,
}) => {
  ensureBinFile(entry);
  const bytesToSend = end - start + 1;
  let sent = 0;
  let fileOffset = start;

  const fd = fs.openSync(entry.binPath, "r+");
  const stream = client.iterDownload({
    file: message.media,
    requestSize: CHUNK_SIZE,
    offset: bigInt(start),
    fileSize: bigInt(entry.totalSize),
  });

  try {
    for await (const chunk of stream) {
      if (!writeResponse && isTelegramStreamWaiting()) break;

      let buffer = Buffer.from(chunk);
      if (sent + buffer.length > bytesToSend) {
        buffer = buffer.subarray(0, bytesToSend - sent);
      }
      if (!buffer.length) continue;

      fs.writeSync(fd, buffer, 0, buffer.length, fileOffset);
      markRangeFilled(entry, fileOffset, buffer.length);
      fileOffset += buffer.length;

      if (writeResponse && res && !res.writableEnded) {
        await writeWithBackpressure(res, buffer);
      }

      sent += buffer.length;
      if (sent >= bytesToSend) break;
    }
  } finally {
    fs.closeSync(fd);
    notifyWaiters(entry);
    saveMeta(entry);
  }

  return sent;
};

const downloadRangeToCache = async ({
  entry,
  client,
  message,
  start,
  end,
  res,
  writeResponse,
}) => {
  if (writeResponse) {
    beginTelegramStreamWait();
    try {
      return await withTelegramPlaybackLock(() =>
        downloadRangeSlice({ entry, client, message, start, end, res, writeResponse: true })
      );
    } finally {
      endTelegramStreamWait();
    }
  }

  let offset = start;
  let totalSent = 0;
  while (offset <= end && !entry.complete) {
    if (isTelegramStreamWaiting()) {
      retryPrefetch(entry, 600);
      return totalSent;
    }
    const sliceEnd = Math.min(end, offset + PREFETCH_SLICE_BYTES - 1);
    const sent = await withTelegramLock(() =>
      downloadRangeSlice({
        entry,
        client,
        message,
        start: offset,
        end: sliceEnd,
        res: null,
        writeResponse: false,
      })
    );
    totalSent += sent;
    if (isTelegramStreamWaiting()) {
      retryPrefetch(entry, 600);
      return totalSent;
    }
    offset = sliceEnd + 1;
  }
  return totalSent;
};

const runWorker = async (entry) => {
  if (entry.workerRunning) return;
  entry.workerRunning = true;

  while (entry.queue.length) {
    const task = entry.queue.shift();
    try {
      await task.run();
    } catch (error) {
      console.warn("[telegram-cache] task error:", error.message);
    }
  }

  entry.workerRunning = false;
};

const enqueueTask = (entry, task) => {
  entry.queue.push(task);
  entry.queue.sort((a, b) => b.priority - a.priority);
  if (!entry.workerRunning) {
    runWorker(entry).catch((err) => {
      console.warn("[telegram-cache] worker failed:", err.message);
    });
  }
};

const contentDispositionHeader = (fileName, asAttachment = false) => {
  const disposition = asAttachment ? "attachment" : "inline";
  return `${disposition}; filename="${String(fileName || "file").replace(/"/g, "")}"`;
};

const wantsAttachmentDownload = (req) =>
  req?.query?.download === "1" || req?.query?.download === "true";

/** PC save must always receive the full file — never a partial stream-cache slice. */
const streamTelegramAttachmentDownload = async ({ channelId, messageId, req, res, getMedia }) => {
  const cacheKey = cacheKeyFor(channelId, messageId);
  let entry = resolveEntryFromDisk(cacheKey, channelId, messageId);
  let meta = readMetaFile(cacheKey);

  if (!meta?.totalSize && !meta?.size) {
    const { meta: liveMeta } = await getMedia({ channelId, messageId });
    meta = liveMeta;
    const contentMeta = await resolveStreamCacheContentMeta(channelId, messageId);
    entry = getOrCreateEntry({ cacheKey, channelId, messageId, meta: liveMeta, contentMeta });
  }

  const totalSize = Number(meta?.totalSize || meta?.size || entry?.totalSize) || 0;
  if (!totalSize) {
    return res.status(416).json({ message: "Unknown file size." });
  }

  const isComplete = Boolean(meta?.complete || entry?.complete);
  const diskPath = isComplete ? resolveStreamCacheDiskPath(cacheKey, { ...meta, complete: true }) : null;

  if (diskPath && fs.existsSync(diskPath)) {
    const stat = fs.statSync(diskPath);
    if (stat.size >= totalSize) {
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", meta.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", contentDispositionHeader(meta.fileName, true));
      res.setHeader("Content-Length", String(totalSize));
      res.setHeader("X-Telegram-Cache", "HIT-FULL");
      res.setHeader("Cache-Control", "private, max-age=3600");
      applyCorsHeaders(req, res);
      res.status(200);
      await pipeline(fs.createReadStream(diskPath, { start: 0, end: totalSize - 1 }), res);
      return;
    }
  }

  const { client, message, meta: liveMeta } = await getMedia({ channelId, messageId });
  const fileSize = Number(liveMeta.size || totalSize);
  return streamDirectFromTelegram({
    client,
    message,
    meta: liveMeta,
    start: 0,
    end: fileSize - 1,
    partial: false,
    totalSize: fileSize,
    req,
    res,
    asAttachment: true,
  });
};

const sendCachedRange = async (entry, start, end, totalSize, partial, req, res, asAttachment = false) => {
  const bytesToSend = end - start + 1;
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", entry.mimeType);
  res.setHeader("Content-Disposition", contentDispositionHeader(entry.fileName, asAttachment));
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("X-Telegram-Cache", entry.complete ? "HIT-FULL" : "HIT-PARTIAL");
  applyCorsHeaders(req, res);

  if (partial) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", String(bytesToSend));
  } else {
    res.status(200);
    res.setHeader("Content-Length", String(totalSize));
  }

  await pipeline(fs.createReadStream(entry.binPath, { start, end }), res);
};

const streamDirectFromTelegram = async ({
  client,
  message,
  meta,
  start,
  end,
  partial,
  totalSize,
  req,
  res,
  asAttachment = false,
}) => {
  const bytesToSend = end - start + 1;
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", meta.mimeType);
  res.setHeader("Content-Disposition", contentDispositionHeader(meta.fileName, asAttachment));
  res.setHeader("Cache-Control", "private, max-age=3600");
  applyCorsHeaders(req, res);

  if (partial) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", String(bytesToSend));
  } else {
    res.status(200);
    res.setHeader("Content-Length", String(totalSize));
  }

  const stream = client.iterDownload({
    file: message.media,
    requestSize: CHUNK_SIZE,
    offset: bigInt(start),
    fileSize: bigInt(totalSize),
  });

  let aborted = false;
  const onClose = () => {
    aborted = true;
  };
  req.on("close", onClose);
  res.on("close", onClose);

  let sent = 0;
  try {
    for await (const chunk of stream) {
      if (aborted || res.writableEnded) break;
      let buffer = Buffer.from(chunk);
      if (sent + buffer.length > bytesToSend) {
        buffer = buffer.subarray(0, bytesToSend - sent);
      }
      if (buffer.length) {
        await writeWithBackpressure(res, buffer);
        sent += buffer.length;
      }
      if (sent >= bytesToSend) break;
    }
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: "Telegram stream failed." });
    }
    console.warn("[telegram-stream]", error.message);
  } finally {
    req.off("close", onClose);
    res.off("close", onClose);
  }

  if (!res.writableEnded) res.end();
};

export const initTelegramStreamCache = (getMedia) => {
  getMediaRef = getMedia;
};

export const streamTelegramMediaWithCache = async ({ channelId, messageId, req, res, getMedia }) => {
  if (!getMediaRef) initTelegramStreamCache(getMedia);

  const asAttachment = wantsAttachmentDownload(req);
  if (asAttachment) {
    return streamTelegramAttachmentDownload({ channelId, messageId, req, res, getMedia });
  }

  const cacheKey = cacheKeyFor(channelId, messageId);
  let entry = resolveEntryFromDisk(cacheKey, channelId, messageId);
  if (entry && !entry.complete) {
    deferBackgroundWarmup(entry, entry.contiguousBytes);
  }

  let totalSize = entry?.totalSize || 0;
  if (!totalSize) {
    const { meta } = await getMedia({ channelId, messageId });
    totalSize = meta.size || 0;
    if (!totalSize) {
      return res.status(416).json({ message: "Unknown file size." });
    }
    const contentMeta = await resolveStreamCacheContentMeta(channelId, messageId);
    entry = getOrCreateEntry({ cacheKey, channelId, messageId, meta, contentMeta });
    deferBackgroundWarmup(entry, 0);
  }

  const range = parseRangeHeader(req.headers.range, totalSize);
  if (range.invalid) {
    res.setHeader("Content-Range", `bytes */${totalSize}`);
    return res.status(416).end();
  }

  const { start, end, partial } = range;

  if (!cacheEnabled()) {
    const { client, message, meta } = await getMedia({ channelId, messageId });
    return streamDirectFromTelegram({
      client,
      message,
      meta,
      start,
      end,
      partial,
      totalSize,
      req,
      res,
      asAttachment,
    });
  }

  entry.lastAccessAt = Date.now();

  if (entry.complete || isRangeCached(entry, start, end)) {
    beginEntryPlayback(entry);
    try {
      deferBackgroundWarmup(entry, end + 1);
      return await sendCachedRange(entry, start, end, totalSize, partial, req, res, asAttachment);
    } finally {
      endEntryPlayback(entry);
    }
  }

  const cachedEnd = findCachedEndWithin(entry, start, end);
  if (cachedEnd >= start) {
    beginEntryPlayback(entry);
    try {
      deferBackgroundWarmup(entry, cachedEnd + 1);
      const servePartial = partial || cachedEnd < end || cachedEnd < totalSize - 1;
      return await sendCachedRange(entry, start, cachedEnd, totalSize, servePartial, req, res, asAttachment);
    } finally {
      endEntryPlayback(entry);
    }
  }

  const fetchEnd = capFetchEnd(entry, start, end);
  beginEntryPlayback(entry);
  try {
    const { client, message, meta } = await getMedia({ channelId, messageId });
    deferBackgroundWarmup(entry, fetchEnd + 1);

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", meta.mimeType);
    res.setHeader("Content-Disposition", contentDispositionHeader(meta.fileName, asAttachment));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Telegram-Cache", "MISS");
    applyCorsHeaders(req, res);

    const bytesToSend = fetchEnd - start + 1;
    const responsePartial = partial || fetchEnd < end || fetchEnd < totalSize - 1;
    if (responsePartial) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${fetchEnd}/${totalSize}`);
      res.setHeader("Content-Length", String(bytesToSend));
    } else {
      res.status(200);
      res.setHeader("Content-Length", String(totalSize));
    }

    let aborted = false;
    const onClose = () => {
      aborted = true;
    };
    req.on("close", onClose);
    res.on("close", onClose);

    try {
      if (!aborted) {
        await downloadRangeToCache({
          entry,
          client,
          message,
          start,
          end: fetchEnd,
          res,
          writeResponse: true,
        });
      }
    } catch (error) {
      if (!res.headersSent) {
        return res.status(500).json({ message: "Telegram stream failed." });
      }
      console.warn("[telegram-stream]", error.message);
    } finally {
      req.off("close", onClose);
      res.off("close", onClose);
    }

    if (!res.writableEnded) res.end();
  } finally {
    endEntryPlayback(entry);
    deferBackgroundWarmup(entry, fetchEnd + 1);
  }
};

const readMetaFile = (cacheKey) => readMetaAtPath(metaPathFor(cacheKey));

const estimateCachedBytes = (meta) => {
  if (!meta?.totalSize) return 0;
  if (meta.complete) return meta.totalSize;
  if (meta.chunkMap) {
    try {
      const buf = Buffer.from(meta.chunkMap, "base64");
      let chunks = 0;
      for (let i = 0; i < buf.length; i += 1) {
        if (buf[i]) chunks += 1;
      }
      return Math.min(meta.totalSize, chunks * MAP_CHUNK);
    } catch {
      /* fall through */
    }
  }
  return Math.min(meta.totalSize, Number(meta.contiguousBytes) || 0);
};

const resolveStreamCacheDiskPath = (cacheKey, meta) => {
  const mp4Path = mp4PathFor(cacheKey);
  if (fs.existsSync(mp4Path)) return mp4Path;
  const binPath = binPathFor(cacheKey);
  if (fs.existsSync(binPath) && (meta?.complete || estimateCachedBytes(meta) > 0)) {
    return binPath;
  }
  return null;
};

const isStreamCachePdfMeta = (meta, linkedContent = null) => {
  if (linkedContent?.type === "pdf") return true;
  if (linkedContent?.type === "video") return false;
  const mime = String(meta?.mimeType || "").toLowerCase();
  if (mime === "application/pdf" || mime.includes("pdf")) return true;
  return /\.pdf$/i.test(String(meta?.fileName || ""));
};

/** Inventory for PC Media Storage UI — cached videos on disk (PDFs excluded). */
export const getStreamCacheInventory = async () => {
  ensureLocalMediaDirs();
  const dir = getStreamCacheDir();
  const migration = await migrateStreamCacheLayouts();
  const sync = reconcileStreamCacheFolder();
  if (!fs.existsSync(dir)) {
    return {
      enabled: cacheEnabled(),
      folderPath: dir,
      folderLabel: "_stream_cache",
      usedBytes: 0,
      itemCount: 0,
      items: [],
      sync,
      migration,
    };
  }

  const Content = (await import("../models/Content.js")).default;
  const metaFiles = collectStreamCacheMetaFiles(dir);
  const items = [];

  for (const metaPath of metaFiles) {
    const meta = readMetaAtPath(metaPath);
    if (!meta?.cacheKey) continue;
    if (isStreamCachePdfMeta(meta)) continue;

    const cacheKey = meta.cacheKey;
    const cachedBytes = estimateCachedBytes(meta);
    const totalSize = Number(meta.totalSize) || 0;
    const cachedPercent = totalSize > 0 ? Math.min(100, Math.round((cachedBytes / totalSize) * 100)) : 0;
    const paths = resolveStreamCachePaths(cacheKey);

    items.push({
      cacheKey,
      channelId: meta.channelId,
      messageId: meta.messageId,
      fileName: meta.fileName || "video.mp4",
      mimeType: meta.mimeType || "video/mp4",
      totalSize,
      cachedBytes,
      cachedPercent,
      complete: Boolean(meta.complete),
      lastAccessAt: meta.lastAccessAt || null,
      diskPath: resolveStreamCacheDiskPath(cacheKey, meta),
      storageRelDir: paths.storageRelDir || meta.storageRelDir || null,
      storageBaseName: paths.storageBaseName || meta.storageBaseName || null,
    });
  }

  items.sort((a, b) => (b.lastAccessAt || 0) - (a.lastAccessAt || 0));

  const messageIds = items.map((item) => Number(item.messageId)).filter(Boolean);
  const contents = messageIds.length
    ? await Content.find({ telegramMessageId: { $in: messageIds } })
        .select("_id title type telegramMessageId telegramChannelId subjectId")
        .populate("subjectId", "name")
        .lean()
    : [];

  const contentByMessage = new Map(
    contents.map((row) => [`${row.telegramChannelId}_${row.telegramMessageId}`, row])
  );

  const videoItems = [];
  for (const item of items) {
    const linked = contentByMessage.get(`${item.channelId}_${item.messageId}`);
    if (isStreamCachePdfMeta({ mimeType: item.mimeType, fileName: item.fileName }, linked)) {
      continue;
    }
    item.contentId = linked?._id ? String(linked._id) : null;
    item.title = linked?.title || item.fileName;
    item.subjectName = linked?.subjectId?.name || null;
    if (linked) {
      const meta = readMetaFile(item.cacheKey);
      ensureStreamCacheLayout(item.cacheKey, meta, {
        contentId: item.contentId,
        title: item.title,
        subjectName: item.subjectName,
      });
      item.diskPath = resolveStreamCacheDiskPath(item.cacheKey, readMetaFile(item.cacheKey));
      const paths = resolveStreamCachePaths(item.cacheKey);
      item.storageRelDir = paths.storageRelDir;
      item.storageBaseName = paths.storageBaseName;
    }
    videoItems.push(item);
  }

  let usedBytes = measureStreamCacheUsedBytes(dir);

  return {
    enabled: cacheEnabled(),
    folderPath: dir,
    folderLabel: "_stream_cache",
    usedBytes,
    itemCount: videoItems.length,
    items: videoItems,
    sync,
    migration,
  };
};

export const revealStreamCacheItemOnDisk = async (cacheKey) => {
  const key = String(cacheKey || "").trim();
  if (!key) throw new Error("cacheKey is required.");
  const meta = readMetaFile(key);
  if (!meta) throw new Error("Cached file not found.");

  const diskPath = resolveStreamCacheDiskPath(key, meta);
  if (!diskPath) throw new Error("No file saved on disk yet.");

  const { isPathUnderLocalMediaRoot } = await import("../config/mediaStorage.js");
  if (!isPathUnderLocalMediaRoot(diskPath)) {
    throw new Error("Path is outside the media folder.");
  }

  const { revealPathInFileManager } = await import("../utils/revealInFileManager.js");
  await revealPathInFileManager(diskPath);
  return { path: diskPath };
};

export const revealStreamCacheFolderOnDisk = async () => {
  ensureLocalMediaDirs();
  const dir = getStreamCacheDir();
  const { openFolderInFileManager } = await import("../utils/revealInFileManager.js");
  await openFolderInFileManager(dir);
  return { path: dir };
};

export const clearStreamCache = ({ cacheKey = null, cacheKeys = null } = {}) => {
  ensureLocalMediaDirs();

  const keys = Array.isArray(cacheKeys)
    ? [...new Set(cacheKeys.map((key) => String(key).trim()).filter(Boolean))]
    : [];

  if (keys.length > 0) {
    keys.forEach((key) => {
      entries.delete(key);
      removeStreamCacheFiles(key);
    });
    reconcileStreamCacheFolder();
    return { cleared: keys.length };
  }

  if (cacheKey) {
    entries.delete(String(cacheKey));
    removeStreamCacheFiles(String(cacheKey));
    reconcileStreamCacheFolder();
    return { cleared: 1 };
  }

  const dir = getStreamCacheDir();
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).isDirectory()) {
          fs.rmSync(full, { recursive: true, force: true });
        } else {
          fs.unlinkSync(full);
        }
      } catch {
        /* ignore */
      }
    }
  }
  entries.clear();
  reconcileStreamCacheFolder();
  return { cleared: "all" };
};

const getStreamCacheLiveState = (cacheKey) => {
  const entry = entries.get(cacheKey);
  if (!entry) {
    return {
      activity: "idle",
      workerRunning: false,
      playbackActive: 0,
      queueLength: 0,
      warmupScheduled: false,
    };
  }

  if (entry.complete) {
    return {
      activity: "complete",
      workerRunning: false,
      playbackActive: entry.playbackActive || 0,
      queueLength: 0,
      warmupScheduled: false,
    };
  }

  if (entry.workerRunning || entry.queue.length > 0 || entry.prefetchRunning) {
    return {
      activity: "running",
      workerRunning: Boolean(entry.workerRunning || entry.prefetchRunning),
      playbackActive: entry.playbackActive || 0,
      queueLength: entry.queue.length,
      warmupScheduled: false,
    };
  }

  if (entry.playbackActive > 0) {
    return {
      activity: "paused",
      workerRunning: false,
      playbackActive: entry.playbackActive,
      queueLength: entry.queue.length,
      warmupScheduled: Boolean(entry.warmupTimer),
    };
  }

  if (entry.warmupTimer) {
    return {
      activity: "warming",
      workerRunning: false,
      playbackActive: 0,
      queueLength: entry.queue.length,
      warmupScheduled: true,
    };
  }

  return {
    activity: "idle",
    workerRunning: false,
    playbackActive: 0,
    queueLength: entry.queue.length,
    warmupScheduled: false,
  };
};

const ensureEntryPrefetch = (cacheKey, meta) => {
  if (!meta || meta.complete || !cacheEnabled()) return null;
  let entry = entries.get(cacheKey);
  if (!entry) {
    entry = restoreEntry(cacheKey, meta);
    entries.set(cacheKey, entry);
  }
  entry.lastAccessAt = Date.now();
  deferBackgroundWarmup(entry, entry.contiguousBytes);
  return entry;
};

export const getStreamCacheStatusByMessage = ({ channelId, messageId }) => {
  const folderPath = getStreamCacheDir();
  const checkedAt = Date.now();
  if (!channelId || !messageId) {
    return {
      eligible: false,
      cached: false,
      complete: false,
      cachedBytes: 0,
      totalSize: 0,
      cachedPercent: 0,
      folderPath,
      checkedAt,
      activity: "idle",
    };
  }

  const cacheKey = cacheKeyFor(channelId, messageId);
  const meta = readMetaFile(cacheKey);
  ensureEntryPrefetch(cacheKey, meta);
  const live = getStreamCacheLiveState(cacheKey);
  if (!meta) {
    return {
      eligible: true,
      cached: false,
      complete: false,
      cachedBytes: 0,
      totalSize: 0,
      cachedPercent: 0,
      folderPath,
      cacheKey,
      checkedAt,
      ...live,
    };
  }

  const totalSize = Number(meta.totalSize) || 0;
  const cachedBytes = estimateCachedBytes(meta);
  const cachedPercent =
    totalSize > 0 ? Math.min(100, Math.round((cachedBytes / totalSize) * 100)) : 0;
  const completeFile =
    meta.complete && ensureStreamCacheMp4Link(cacheKey)
      ? getCompleteStreamCacheFile({ channelId, messageId })
      : null;

  return {
    eligible: true,
    cached: cachedBytes > 0 || Boolean(meta.complete),
    complete: Boolean(meta.complete),
    cachedBytes,
    totalSize,
    cachedPercent,
    folderPath,
    cacheKey,
    playWebPath: completeFile?.playWebPath || null,
    lastAccessAt: meta.lastAccessAt || null,
    checkedAt,
    ...live,
    activity: meta.complete ? "complete" : live.activity,
  };
};

/** Absolute path to a fully cached stream file, when ready for direct disk playback. */
export const getCompleteStreamCacheFile = ({ channelId, messageId }) => {
  if (!channelId || !messageId) return null;
  const cacheKey = cacheKeyFor(channelId, messageId);
  const meta = readMetaFile(cacheKey);
  if (!meta?.complete) return null;
  if (!ensureStreamCacheMp4Link(cacheKey)) return null;

  const mp4Path = mp4PathFor(cacheKey);
  if (!fs.existsSync(mp4Path)) return null;

  const paths = resolveStreamCachePaths(cacheKey);
  return {
    absolutePath: mp4Path,
    playWebPath: toMediaWebPath("_stream_cache", streamCacheWebRelPath(paths, ".mp4")),
    mimeType: meta.mimeType || "video/mp4",
    fileName: meta.fileName || "video.mp4",
    totalSize: Number(meta.totalSize) || 0,
  };
};
