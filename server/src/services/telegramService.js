import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { applyCorsHeaders } from "../config/cors.js";
import TelegramSession from "../models/TelegramSession.js";

const require = createRequire(import.meta.url);
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const bigInt = require("big-integer");

const pendingLogins = new Map();

let activeClient = null;
let activeClientPromise = null;

const getApiCredentials = () => {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = String(process.env.TELEGRAM_API_HASH || "").trim();
  if (!apiId || !apiHash) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in server/.env");
  }
  return { apiId, apiHash };
};

const normalizePhone = (phone = "") => String(phone || "").replace(/\s+/g, "").trim();

const createClient = (stringSession = "") => {
  const { apiId, apiHash } = getApiCredentials();
  return new TelegramClient(new StringSession(stringSession), apiId, apiHash, {
    connectionRetries: 5,
  });
};

const disconnectClient = async (client) => {
  if (!client) return;
  try {
    await client.disconnect();
  } catch {
    // ignore disconnect errors
  }
};

export const getActiveSession = async () =>
  TelegramSession.findOne({ isActive: true }).sort({ updatedAt: -1 });

export const disconnectActiveClient = async () => {
  if (activeClient) {
    await disconnectClient(activeClient);
    activeClient = null;
  }
  activeClientPromise = null;
};

export const getTelegramClient = async () => {
  if (activeClient?.connected) return activeClient;
  if (activeClientPromise) return activeClientPromise;

  activeClientPromise = (async () => {
    const session = await getActiveSession();
    if (!session?.stringSession) {
      throw new Error("No active Telegram session. Log in first.");
    }

    const client = createClient(session.stringSession);
    await client.connect();
    if (!(await client.isUserAuthorized())) {
      await disconnectClient(client);
      throw new Error("Telegram session expired. Log in again.");
    }

    activeClient = client;
    return client;
  })();

  try {
    return await activeClientPromise;
  } finally {
    activeClientPromise = null;
  }
};

export const startTelegramLogin = async (phoneRaw) => {
  const phone = normalizePhone(phoneRaw);
  if (!phone) throw new Error("Phone number is required.");

  const existing = pendingLogins.get(phone);
  if (existing?.client) {
    await disconnectClient(existing.client);
  }

  const client = createClient("");
  await client.connect();

  const { apiId, apiHash } = getApiCredentials();
  const result = await client.sendCode({ apiId, apiHash }, phone);

  pendingLogins.set(phone, {
    client,
    phoneCodeHash: result.phoneCodeHash,
    phone,
    createdAt: Date.now(),
  });

  return { phone, sent: true };
};

export const verifyTelegramOtp = async ({ phone: phoneRaw, code }) => {
  const phone = normalizePhone(phoneRaw);
  const pending = pendingLogins.get(phone);
  if (!pending) throw new Error("Login session expired. Request a new code.");

  const otp = String(code || "").trim();
  if (!otp) throw new Error("OTP code is required.");

  try {
    await pending.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash: pending.phoneCodeHash,
        phoneCode: otp,
      })
    );
  } catch (error) {
    const message = error?.errorMessage || error?.message || "";
    if (message === "SESSION_PASSWORD_NEEDED") {
      return { needsPassword: true, phone };
    }
    throw error;
  }

  return finalizeTelegramLogin(phone, pending.client);
};

export const verifyTelegramPassword = async ({ phone: phoneRaw, password }) => {
  const phone = normalizePhone(phoneRaw);
  const pending = pendingLogins.get(phone);
  if (!pending) throw new Error("Login session expired. Request a new code.");

  const pwd = String(password || "");
  if (!pwd) throw new Error("2FA password is required.");

  const { apiId, apiHash } = getApiCredentials();
  await pending.client.signInWithPassword(
    { apiId, apiHash },
    {
      password: async () => pwd,
      onError: async () => false,
    }
  );

  return finalizeTelegramLogin(phone, pending.client);
};

const finalizeTelegramLogin = async (phone, client) => {
  const stringSession = client.session.save();

  await TelegramSession.updateMany({ isActive: true }, { isActive: false });
  await TelegramSession.create({ stringSession, phone, isActive: true });

  pendingLogins.delete(phone);
  await disconnectActiveClient();
  activeClient = client;

  return { phone, connected: true };
};

export const logoutTelegram = async () => {
  pendingLogins.clear();
  await disconnectActiveClient();
  await TelegramSession.updateMany({ isActive: true }, { isActive: false });
  return { loggedOut: true };
};

const getDialogPhoto = async (client, entity) => {
  try {
    if (!entity?.photo) return null;
    const buffer = await client.downloadProfilePhoto(entity, { isBig: false });
    if (!buffer?.length) return null;
    return `data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`;
  } catch {
    return null;
  }
};

export const fetchTelegramChannels = async () => {
  const client = await getTelegramClient();
  const dialogs = await client.getDialogs({ limit: 200 });

  const channels = [];
  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!(entity instanceof Api.Channel || entity instanceof Api.Chat)) continue;

    const id = String(dialog.id);
    const title = entity.title || dialog.title || dialog.name || "Untitled";
    const photo = await getDialogPhoto(client, entity);

    channels.push({
      id,
      title,
      photo,
      participantCount: entity.participantsCount ?? null,
      isGroup: entity instanceof Api.Chat || Boolean(entity.megagroup),
    });
  }

  return channels.sort((a, b) => a.title.localeCompare(b.title));
};

export const buildTelegramContentTitle = (fileName = "") => {
  const base = String(fileName).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Telegram media";
};

/** Prefer Telegram post caption (original lesson title) over auto-generated file names. */
export const resolveTelegramMediaTitle = ({ fileName = "", caption = null } = {}) => {
  const cleanedCaption = String(caption || "").trim();
  if (cleanedCaption) return cleanedCaption;
  return buildTelegramContentTitle(fileName);
};

const getDocumentMeta = (message) => {
  const media = message?.media;
  if (!(media instanceof Api.MessageMediaDocument)) return null;

  const doc = media.document;
  if (!(doc instanceof Api.Document)) return null;

  let fileName = "file";
  let duration = null;
  for (const attr of doc.attributes || []) {
    if (attr instanceof Api.DocumentAttributeFilename) {
      fileName = attr.fileName || fileName;
    }
    if (attr instanceof Api.DocumentAttributeVideo) {
      duration = attr.duration ?? null;
    }
  }

  const mimeType = doc.mimeType || "application/octet-stream";
  const size = Number(doc.size || 0);
  const isVideo = mimeType.startsWith("video/") || /\.(mp4|webm|mkv|mov|m4v)$/i.test(fileName);
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName);

  if (!isVideo && !isPdf) return null;

  const topicId = getTopicIdFromMessage(message);

  const caption = String(message.message || "").trim() || null;

  return {
    messageId: message.id,
    fileName,
    displayName: resolveTelegramMediaTitle({ fileName, caption }),
    mimeType,
    size,
    uploadDate: message.date ? new Date(message.date * 1000).toISOString() : null,
    duration,
    mediaType: isVideo ? "video" : "pdf",
    thumbnail: null,
    topicId,
    caption,
  };
};

export const getTopicIdFromMessage = (message) => {
  if (!message?.replyTo) return null;
  return message.replyTo.replyToTopId || message.replyTo.replyToMsgId || null;
};

const normalizeTopicTitle = (title) => {
  if (!title) return "";
  if (typeof title === "string") return title.trim();
  if (typeof title?.text === "string") return title.text.trim();
  return String(title).trim();
};

const mapForumTopic = (topic) => {
  const title = normalizeTopicTitle(topic.title);
  if (topic.className !== "ForumTopic" || !title) return null;
  return {
    id: topic.id,
    title,
    topMessageId: topic.topMessage,
    unreadCount: topic.unreadCount ?? 0,
  };
};

const fetchForumTopicsList = async (channelId) => {
  const client = await getTelegramClient();
  const input = await client.getInputEntity(channelId);
  const topics = [];
  let offsetTopic = 0;
  let offsetId = 0;
  let offsetDate = 0;

  for (let page = 0; page < 20; page++) {
    const result = await client.invoke(
      new Api.channels.GetForumTopics({
        channel: input,
        offsetDate,
        offsetId,
        offsetTopic,
        limit: 100,
      })
    );

    const activeTopics = [];
    for (const topic of result.topics || []) {
      const mapped = mapForumTopic(topic);
      if (mapped) {
        topics.push(mapped);
        activeTopics.push(topic);
      }
    }

    if (activeTopics.length < 100) break;
    const last = activeTopics[activeTopics.length - 1];
    offsetTopic = last.id;
    offsetId = last.topMessage;
    offsetDate = last.date || 0;
  }

  return topics;
};

export const discoverTopicIdsFromChannel = async (channelId, messageLimit = 3000) => {
  const client = await getTelegramClient();
  const entity = await client.getEntity(channelId);
  const topicIds = new Set();

  for await (const message of client.iterMessages(entity, { limit: messageLimit })) {
    const topicId = getTopicIdFromMessage(message);
    if (topicId) topicIds.add(Number(topicId));
  }

  return [...topicIds];
};

export const fetchForumTopicsByIds = async (channelId, topicIds = []) => {
  if (!topicIds.length) return [];
  const client = await getTelegramClient();
  const input = await client.getInputEntity(channelId);

  try {
    const result = await client.invoke(
      new Api.channels.GetForumTopicsByID({
        channel: input,
        topics: topicIds.map(Number),
      })
    );

    const topics = [];
    for (const topic of result.topics || []) {
      const mapped = mapForumTopic(topic);
      if (mapped) topics.push(mapped);
    }
    return topics;
  } catch {
    return [];
  }
};

export const fetchForumTopicsForChannel = async (channelId) => {
  const fromList = await fetchForumTopicsList(channelId);
  const byId = new Map(fromList.map((topic) => [topic.id, topic]));

  const discoveredIds = await discoverTopicIdsFromChannel(channelId);
  const missingIds = discoveredIds.filter((id) => !byId.has(id));
  if (missingIds.length) {
    const resolved = await fetchForumTopicsByIds(channelId, missingIds);
    for (const topic of resolved) {
      if (!byId.has(topic.id)) byId.set(topic.id, topic);
    }
  }

  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
};

export const fetchMediaInTopic = async ({ channelId, topicId, limit = 500 }) => {
  const client = await getTelegramClient();
  const entity = await client.getEntity(channelId);
  const rawMessages = await client.getMessages(entity, {
    replyTo: Number(topicId),
    limit: Math.min(limit, 500),
  });

  const items = [];
  for (const message of rawMessages) {
    const meta = getDocumentMeta(message);
    if (meta) items.push(meta);
  }
  items.sort((a, b) => a.messageId - b.messageId);
  return items;
};

export const fetchTelegramMessages = async ({
  channelId,
  page = 1,
  limit = 20,
  search = "",
  mediaType = "",
  importStatus = "",
  sort = "newest",
  dateFrom = "",
  dateTo = "",
  minSize = 0,
  maxSize = 0,
  importedMap = null,
}) => {
  const client = await getTelegramClient();
  const entity = await client.getEntity(channelId);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);

  const rawMessages = await client.getMessages(entity, {
    limit: 500,
    search: search ? String(search).trim() : undefined,
  });

  let items = [];
  for (const message of rawMessages) {
    const meta = getDocumentMeta(message);
    if (!meta) continue;
    if (mediaType === "video" && meta.mediaType !== "video") continue;
    if (mediaType === "pdf" && meta.mediaType !== "pdf") continue;

    if (dateFrom && meta.uploadDate && new Date(meta.uploadDate) < new Date(dateFrom)) continue;
    if (dateTo && meta.uploadDate && new Date(meta.uploadDate) > new Date(`${dateTo}T23:59:59`)) continue;
    if (minSize && meta.size < Number(minSize)) continue;
    if (maxSize && meta.size > Number(maxSize)) continue;

    const imported = importedMap?.get(meta.messageId) || null;
    if (importStatus === "new" && imported) continue;
    if (importStatus === "imported" && !imported) continue;

    items.push({
      ...meta,
      imported: Boolean(imported),
      contentId: imported?.contentId || null,
      importedTitle: imported?.title || null,
    });
  }

  if (sort === "oldest") {
    items.sort((a, b) => a.messageId - b.messageId);
  } else if (sort === "name") {
    items.sort((a, b) => a.fileName.localeCompare(b.fileName));
  } else if (sort === "size") {
    items.sort((a, b) => b.size - a.size);
  } else {
    items.sort((a, b) => b.messageId - a.messageId);
  }

  const total = items.length;
  const start = (safePage - 1) * safeLimit;
  const pageItems = items.slice(start, start + safeLimit);

  return {
    items: pageItems,
    page: safePage,
    limit: safeLimit,
    total,
    hasMore: start + safeLimit < total,
    stats: {
      totalMedia: total,
      importedCount: items.filter((i) => i.imported).length,
      newCount: items.filter((i) => !i.imported).length,
      videoCount: items.filter((i) => i.mediaType === "video").length,
      pdfCount: items.filter((i) => i.mediaType === "pdf").length,
    },
  };
};

export const fetchAllChannelMedia = async ({ channelId, maxMessages = 2000 }) => {
  const client = await getTelegramClient();
  const entity = await client.getEntity(channelId);
  const rawMessages = await client.getMessages(entity, { limit: Math.min(maxMessages, 2000) });

  const items = [];
  for (const message of rawMessages) {
    const meta = getDocumentMeta(message);
    if (meta) items.push(meta);
  }
  items.sort((a, b) => a.messageId - b.messageId);
  return items;
};

export const getTelegramMessageMedia = async ({ channelId, messageId }) => {
  const client = await getTelegramClient();
  const entity = await client.getEntity(channelId);
  const messages = await client.getMessages(entity, { ids: Number(messageId) });
  const message = Array.isArray(messages) ? messages[0] : messages;

  if (!message) throw new Error("Telegram message not found.");
  const meta = getDocumentMeta(message);
  if (!meta) throw new Error("Message does not contain a streamable video or PDF.");

  return { client, message, meta };
};

export const downloadTelegramDocumentToFile = async ({
  channelId,
  messageId,
  destPath,
  onProgress,
}) => {
  const { message, meta } = await getTelegramMessageMedia({ channelId, messageId });
  if (meta.mediaType !== "pdf") {
    throw new Error("Telegram message is not a PDF document.");
  }

  const client = await getTelegramClient();
  const buffer = await client.downloadMedia(message, {
    progressCallback:
      typeof onProgress === "function"
        ? (downloaded, total) => {
            onProgress({
              bytesLoaded: Number(downloaded) || 0,
              bytesTotal: Number(total) || meta.size || 0,
              percent:
                total > 0
                  ? Math.min(100, (Number(downloaded) / Number(total)) * 100)
                  : 0,
            });
          }
        : undefined,
  });

  if (!buffer || !buffer.length) {
    throw new Error("Failed to download Telegram PDF.");
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
  return { size: buffer.length, fileName: meta.fileName };
};

const parseRangeHeader = (rangeHeader, totalSize) => {
  if (!rangeHeader || !/^bytes=/i.test(rangeHeader)) {
    return { start: 0, end: totalSize - 1, partial: false };
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
  if (!match) {
    return { start: 0, end: totalSize - 1, partial: false };
  }

  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
    return { invalid: true };
  }

  end = Math.min(end, totalSize - 1);
  return { start, end, partial: true };
};

export const streamTelegramMedia = async ({ channelId, messageId, req, res }) => {
  const { client, message, meta } = await getTelegramMessageMedia({ channelId, messageId });
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
    requestSize: 512 * 1024,
    offset: bigInt(start),
    fileSize: bigInt(totalSize),
  });

  let sent = 0;
  for await (const chunk of stream) {
    if (res.writableEnded) break;
    let buffer = Buffer.from(chunk);
    if (sent + buffer.length > bytesToSend) {
      buffer = buffer.subarray(0, bytesToSend - sent);
    }
    if (buffer.length) {
      res.write(buffer);
      sent += buffer.length;
    }
    if (sent >= bytesToSend) break;
  }

  if (!res.writableEnded) res.end();
};
