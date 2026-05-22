import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
import { applyCorsHeaders } from "../config/cors.js";

const require = createRequire(import.meta.url);
const bigInt = require("big-integer");

const CACHE_ROOT = path.join(os.tmpdir(), "cds-telegram-stream-cache");
const CHUNK_SIZE = Math.max(
  256 * 1024,
  Number(process.env.TELEGRAM_STREAM_CHUNK_KB || 2048) * 1024
);
const MAP_CHUNK = 256 * 1024;
const MAX_WAIT_MS = Math.max(5000, Number(process.env.TELEGRAM_STREAM_WAIT_MS || 45000));
const PRIORITY_TAIL_BYTES = Math.max(
  2 * 1024 * 1024,
  Number(process.env.TELEGRAM_STREAM_TAIL_MB || 8) * 1024 * 1024
);

const cacheEnabled = () => String(process.env.TELEGRAM_STREAM_CACHE ?? "1") !== "0";

/** @type {Map<string, object>} */
const entries = new Map();

const cacheKeyFor = (channelId, messageId) => `${channelId}_${messageId}`;
const metaPathFor = (cacheKey) => path.join(CACHE_ROOT, `${cacheKey}.meta.json`);
const binPathFor = (cacheKey) => path.join(CACHE_ROOT, `${cacheKey}.bin`);

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
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
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
    warmupScheduled: false,
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
    warmupScheduled: false,
  };
  entries.set(cacheKey, entry);
  return entry;
};

const ensureBinFile = (entry) => {
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
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

const scheduleWarmup = (entry) => {
  if (entry.complete || entry.warmupScheduled) return;
  entry.warmupScheduled = true;

  enqueueTask(entry, {
    priority: 2,
    run: async () => {
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
    priority: 1,
    run: async () => {
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

  const { client, message, meta } = await getMedia({ channelId, messageId });
  const totalSize = meta.size || 0;
  if (!totalSize) {
    return res.status(416).json({ message: "Unknown file size." });
  }

  const range = parseRangeHeader(req.headers.range, totalSize);
  if (range.invalid) {
    res.setHeader("Content-Range", `bytes */${totalSize}`);
    return res.status(416).end();
  }

  const { start, end, partial } = range;

  if (!cacheEnabled()) {
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

  const cacheKey = cacheKeyFor(channelId, messageId);
  const entry = getOrCreateEntry({ cacheKey, channelId, messageId, meta });
  entry.lastAccessAt = Date.now();
  scheduleWarmup(entry);

  if (entry.complete || isRangeCached(entry, start, end)) {
    return sendCachedRange(entry, start, end, totalSize, partial, req, res);
  }

  try {
    await waitForCachedRange(entry, start, end, req);
    if (isRangeCached(entry, start, end) || entry.complete) {
      return sendCachedRange(entry, start, end, totalSize, partial, req, res);
    }
  } catch {
    /* fall through */
  }

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
    await new Promise((resolve, reject) => {
      enqueueTask(entry, {
        priority: 10,
        run: async () => {
          if (aborted) return resolve();
          try {
            await downloadRangeToCache({
              entry,
              client,
              message,
              start,
              end,
              res,
              writeResponse: true,
            });
            resolve();
          } catch (error) {
            reject(error);
          }
        },
      });
    });
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
