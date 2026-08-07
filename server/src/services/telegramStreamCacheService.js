import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
import { applyCorsHeaders } from "../config/cors.js";
import { ensureLocalMediaDirs, getStreamCacheDir } from "../config/mediaStorage.js";
import { beginTelegramPlayback, endTelegramPlayback } from "./telegramService.js";

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
  5000,
  Number(process.env.TELEGRAM_STREAM_WARMUP_DELAY_MS || 20000)
);
const PRIORITY_TAIL_BYTES = Math.max(
  2 * 1024 * 1024,
  Number(process.env.TELEGRAM_STREAM_TAIL_MB || defaultTailMb()) * 1024 * 1024
);

const cacheEnabled = () => String(process.env.TELEGRAM_STREAM_CACHE ?? "1") !== "0";

/** @type {Map<string, object>} */
const entries = new Map();

const cacheKeyFor = (channelId, messageId) => `${channelId}_${messageId}`;
const metaPathFor = (cacheKey) => path.join(getStreamCacheDir(), `${cacheKey}.meta.json`);
const binPathFor = (cacheKey) => path.join(getStreamCacheDir(), `${cacheKey}.bin`);

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
  fs.writeFileSync(
    metaPathFor(entry.cacheKey),
    JSON.stringify({
      cacheKey: entry.cacheKey,
      channelId: entry.channelId,
      messageId: entry.messageId,
      totalSize: entry.totalSize,
      mimeType: entry.mimeType,
      fileName: entry.fileName,
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
    binPath: binPathFor(cacheKey),
    chunkMap,
    contiguousBytes: meta.contiguousBytes || 0,
    complete: Boolean(meta.complete),
    lastAccessAt: meta.lastAccessAt || Date.now(),
    waiters: [],
    queue: [],
    workerRunning: false,
    warmupTimer: null,
    playbackActive: 0,
  };
};

const getOrCreateEntry = ({ cacheKey, channelId, messageId, meta }) => {
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
    binPath: binPathFor(cacheKey),
    chunkMap: createChunkMap(meta.size),
    contiguousBytes: 0,
    complete: false,
    lastAccessAt: Date.now(),
    waiters: [],
    queue: [],
    workerRunning: false,
    warmupTimer: null,
    playbackActive: 0,
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

const runBackgroundWarmup = (entry) => {
  if (entry.complete || entry.playbackActive > 0) return;

  enqueueTask(entry, {
    priority: 0,
    run: async () => {
      if (entry.playbackActive > 0 || entry.complete) return;
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
    run: async () => {
      if (entry.playbackActive > 0 || entry.complete) return;
      const { client, message } = await taskGetMedia(entry.channelId, entry.messageId);
      const start = entry.contiguousBytes;
      if (start >= entry.totalSize) {
        entry.complete = true;
        saveMeta(entry);
        notifyWaiters(entry);
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
      }
    },
  });
};

/** Fill cache in the background only — never before or during active playback. */
const deferBackgroundWarmup = (entry) => {
  if (entry.complete) return;
  if (entry.warmupTimer) return;
  entry.warmupTimer = setTimeout(() => {
    entry.warmupTimer = null;
    if (entry.playbackActive > 0) {
      deferBackgroundWarmup(entry);
      return;
    }
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

const downloadRangeToCache = async ({
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

const sendCachedRange = async (entry, start, end, totalSize, partial, req, res) => {
  const bytesToSend = end - start + 1;
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", entry.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${entry.fileName.replace(/"/g, "")}"`);
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
}) => {
  const bytesToSend = end - start + 1;
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", meta.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${meta.fileName.replace(/"/g, "")}"`);
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

  const cacheKey = cacheKeyFor(channelId, messageId);
  let entry = resolveEntryFromDisk(cacheKey, channelId, messageId);

  let totalSize = entry?.totalSize || 0;
  if (!totalSize) {
    const { meta } = await getMedia({ channelId, messageId });
    totalSize = meta.size || 0;
    if (!totalSize) {
      return res.status(416).json({ message: "Unknown file size." });
    }
    entry = getOrCreateEntry({ cacheKey, channelId, messageId, meta });
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
    });
  }

  entry.lastAccessAt = Date.now();

  if (entry.complete || isRangeCached(entry, start, end)) {
    beginEntryPlayback(entry);
    try {
      deferBackgroundWarmup(entry);
      return await sendCachedRange(entry, start, end, totalSize, partial, req, res);
    } finally {
      endEntryPlayback(entry);
    }
  }

  beginEntryPlayback(entry);
  try {
    const { client, message, meta } = await getMedia({ channelId, messageId });

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", meta.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${meta.fileName.replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Telegram-Cache", "MISS");
    applyCorsHeaders(req, res);

    const bytesToSend = end - start + 1;
    if (partial) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
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
          end,
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
    deferBackgroundWarmup(entry);
  }
};

const readMetaFile = (cacheKey) => {
  const metaPath = metaPathFor(cacheKey);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
};

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

/** Inventory for PC Media Storage UI — where seek/stream cache lives on disk. */
export const getStreamCacheInventory = async () => {
  ensureLocalMediaDirs();
  const dir = getStreamCacheDir();
  if (!fs.existsSync(dir)) {
    return {
      enabled: cacheEnabled(),
      folderPath: dir,
      folderLabel: "_stream_cache",
      usedBytes: 0,
      itemCount: 0,
      items: [],
    };
  }

  const Content = (await import("../models/Content.js")).default;
  const metaFiles = fs.readdirSync(dir).filter((name) => name.endsWith(".meta.json"));
  const items = [];

  for (const fileName of metaFiles) {
    const cacheKey = fileName.replace(/\.meta\.json$/, "");
    const meta = readMetaFile(cacheKey);
    if (!meta) continue;

    const cachedBytes = estimateCachedBytes(meta);
    const totalSize = Number(meta.totalSize) || 0;
    const cachedPercent = totalSize > 0 ? Math.min(100, Math.round((cachedBytes / totalSize) * 100)) : 0;

    items.push({
      cacheKey,
      channelId: meta.channelId,
      messageId: meta.messageId,
      fileName: meta.fileName || "video.mp4",
      totalSize,
      cachedBytes,
      cachedPercent,
      complete: Boolean(meta.complete),
      lastAccessAt: meta.lastAccessAt || null,
    });
  }

  items.sort((a, b) => (b.lastAccessAt || 0) - (a.lastAccessAt || 0));

  const messageIds = items.map((item) => Number(item.messageId)).filter(Boolean);
  const contents = messageIds.length
    ? await Content.find({ telegramMessageId: { $in: messageIds } })
        .select("_id title telegramMessageId telegramChannelId subjectId")
        .populate("subjectId", "name")
        .lean()
    : [];

  const contentByMessage = new Map(
    contents.map((row) => [`${row.telegramChannelId}_${row.telegramMessageId}`, row])
  );

  for (const item of items) {
    const linked = contentByMessage.get(`${item.channelId}_${item.messageId}`);
    item.contentId = linked?._id ? String(linked._id) : null;
    item.title = linked?.title || item.fileName;
    item.subjectName = linked?.subjectId?.name || null;
  }

  let usedBytes = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) usedBytes += stat.size;
    } catch {
      /* ignore */
    }
  }

  return {
    enabled: cacheEnabled(),
    folderPath: dir,
    folderLabel: "_stream_cache",
    usedBytes,
    itemCount: items.length,
    items,
  };
};

export const clearStreamCache = ({ cacheKey = null } = {}) => {
  ensureLocalMediaDirs();
  const dir = getStreamCacheDir();

  const removeKey = (key) => {
    entries.delete(key);
    for (const suffix of [".meta.json", ".bin"]) {
      try {
        fs.unlinkSync(path.join(dir, `${key}${suffix}`));
      } catch {
        /* ignore */
      }
    }
  };

  if (cacheKey) {
    removeKey(String(cacheKey));
    return { cleared: 1 };
  }

  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  }
  entries.clear();
  return { cleared: "all" };
};

export const getStreamCacheStatusByMessage = ({ channelId, messageId }) => {
  const folderPath = getStreamCacheDir();
  if (!channelId || !messageId) {
    return {
      eligible: false,
      cached: false,
      complete: false,
      cachedBytes: 0,
      totalSize: 0,
      cachedPercent: 0,
      folderPath,
    };
  }

  const cacheKey = cacheKeyFor(channelId, messageId);
  const meta = readMetaFile(cacheKey);
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
    };
  }

  const totalSize = Number(meta.totalSize) || 0;
  const cachedBytes = estimateCachedBytes(meta);
  const cachedPercent =
    totalSize > 0 ? Math.min(100, Math.round((cachedBytes / totalSize) * 100)) : 0;

  return {
    eligible: true,
    cached: cachedBytes > 0 || Boolean(meta.complete),
    complete: Boolean(meta.complete),
    cachedBytes,
    totalSize,
    cachedPercent,
    folderPath,
    cacheKey,
    lastAccessAt: meta.lastAccessAt || null,
  };
};
