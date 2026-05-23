import Chapter from "../models/Chapter.js";
import Content from "../models/Content.js";
import Subject from "../models/Subject.js";
import TelegramChannelMapping from "../models/TelegramChannelMapping.js";
import { getOrCreateChapterForSubject } from "../utils/chapterHelpers.js";
import { parseChapterAndTitleFromFilename } from "../utils/contentHelpers.js";
import {
  resolveTelegramMediaTitle,
  getTelegramMessageMedia,
  fetchForumTopicsForChannel,
  fetchForumTopicsByIds,
  fetchMediaInTopic,
  getActiveSession,
} from "./telegramService.js";
import { deleteContentsWithAssets } from "./contentCleanupService.js";
import { deleteSubjectTree } from "./subjectCleanupService.js";
import { buildTelegramPdfContentFields } from "./telegramPdfImportService.js";
import { completeProgress, initProgress, setProgress } from "./uploadProgressBus.js";

const normalizeKey = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Match filename to an existing subject in the programme. */
export const matchSubjectForFileName = (fileName, subjects = []) => {
  const base = String(fileName || "").replace(/\.[^.]+$/, "");
  const haystack = normalizeKey(base);

  const ranked = [...subjects].sort((a, b) => b.name.length - a.name.length);
  for (const subject of ranked) {
    const needle = normalizeKey(subject.name);
    if (!needle) continue;
    if (haystack.startsWith(needle) || haystack.includes(` ${needle} `) || haystack.includes(needle)) {
      return subject;
    }
  }
  return null;
};

export const getOrCreateSubjectForProgramme = async (programmeId, subjectName) => {
  const name = String(subjectName || "").trim();
  if (!name) throw new Error("Subject name is empty");

  const exact = await Subject.findOne({ programmeId, name });
  if (exact) return exact;

  const siblings = await Subject.find({ programmeId }).select("name");
  const key = name.toLowerCase();
  const ci = siblings.find((s) => s.name.trim().toLowerCase() === key);
  if (ci) return ci;

  try {
    return await Subject.create({ programmeId, name });
  } catch (err) {
    if (err?.code === 11000) {
      return Subject.findOne({ programmeId, name });
    }
    throw err;
  }
};

/** Infer subject from filename prefix before first dash/underscore segment. */
export const inferSubjectNameFromFileName = (fileName = "") => {
  const base = String(fileName).replace(/\.[^.]+$/, "").trim();
  const parts = base.split(/[-–—_|/\\]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[0];
  return null;
};

export const resolveSubjectForImport = async ({ programmeId, fileName, subjects, createMissingSubjects }) => {
  let subject = matchSubjectForFileName(fileName, subjects);
  if (subject) return subject;

  const inferred = inferSubjectNameFromFileName(fileName);
  if (inferred) {
    subject = subjects.find((s) => normalizeKey(s.name) === normalizeKey(inferred));
    if (subject) return subject;
    if (createMissingSubjects) {
      return getOrCreateSubjectForProgramme(programmeId, inferred);
    }
  }

  return null;
};

export const getImportedContentMap = async (channelId, messageIds = []) => {
  if (!messageIds.length) return new Map();
  const rows = await Content.find({
    telegramChannelId: String(channelId),
    telegramMessageId: { $in: messageIds },
  }).select("_id telegramMessageId title subjectId chapterId");

  const map = new Map();
  for (const row of rows) {
    map.set(row.telegramMessageId, {
      contentId: row._id,
      title: row.title,
      subjectId: row.subjectId,
      chapterId: row.chapterId,
    });
  }
  return map;
};

export const importTelegramMessages = async ({
  channelId,
  channelTitle,
  programmeId,
  messages = [],
  createMissingSubjects = true,
  autoCreateChapters = true,
  defaultSubjectId = null,
  defaultChapterName = "General",
  uploadId = null,
}) => {
  const subjects = await Subject.find({ programmeId });
  const subjectCache = new Map(subjects.map((s) => [String(s._id), s]));
  const createdSubjects = [];
  const created = [];
  const skipped = [];
  let maxMessageId = 0;

  const cloudifyMessages = messages.filter(
    (m) => m.mediaType === "pdf" || m.mediaType === "video"
  );
  if (uploadId) {
    initProgress(uploadId, {
      phase: "pending",
      message: "Preparing Telegram import…",
      filesTotal: cloudifyMessages.length,
      fileIndex: 0,
    });
  }
  let mediaIndex = 0;

  for (const meta of messages) {
    const messageId = Number(meta.messageId);
    if (!messageId) continue;
    maxMessageId = Math.max(maxMessageId, messageId);

    const existing = await Content.findOne({
      telegramChannelId: String(channelId),
      telegramMessageId: messageId,
    });
    if (existing) {
      skipped.push({
        messageId,
        fileName: meta.fileName,
        reason: "Already imported",
        contentId: existing._id,
      });
      continue;
    }

    let subject = null;
    if (defaultSubjectId) {
      subject = subjects.find((s) => String(s._id) === String(defaultSubjectId));
    }
    if (!subject) {
      subject = await resolveSubjectForImport({
        programmeId,
        fileName: meta.fileName,
        subjects: [...subjects, ...createdSubjects],
        createMissingSubjects,
      });
    }
    if (!subject && createMissingSubjects) {
      subject = await getOrCreateSubjectForProgramme(programmeId, "General");
      if (!subjects.some((s) => String(s._id) === String(subject._id))) {
        subjects.push(subject);
        createdSubjects.push(subject);
      }
    }
    if (!subject) {
      skipped.push({ messageId, fileName: meta.fileName, reason: "No matching subject" });
      continue;
    }

    let chapterName = defaultChapterName;
    let title = resolveTelegramMediaTitle(meta);
    if (autoCreateChapters) {
      const parsed = parseChapterAndTitleFromFilename(meta.fileName);
      chapterName = parsed.chapterName || defaultChapterName;
      if (!meta.caption && parsed.title) title = parsed.title;
    }

    let chapter;
    try {
      chapter = await getOrCreateChapterForSubject(subject._id, chapterName);
    } catch {
      chapter = await getOrCreateChapterForSubject(subject._id, defaultChapterName);
    }

    const payload = await buildTelegramContentPayload({
      channelId,
      meta,
      subject,
      chapter,
      title,
      uploadId,
      mediaFileIndex:
        meta.mediaType === "pdf" || meta.mediaType === "video" ? mediaIndex++ : 0,
      mediaFilesTotal: cloudifyMessages.length,
    });

    const doc = await Content.create(payload);

    created.push({
      ...doc.toObject(),
      subjectName: subject.name,
      chapterName: chapter.chapterName,
    });
  }

  if (uploadId) {
    completeProgress(uploadId, {
      message: `Imported ${created.length} item(s)`,
      filesTotal: cloudifyMessages.length,
      fileIndex: pdfMessages.length,
    });
  }

  return { created, skipped, maxMessageId, createdSubjects };
};

export const upsertChannelMapping = async ({
  channelId,
  channelTitle,
  programmeId,
  autoSync,
  lastSyncedMessageId,
  importedCount = 0,
  syncTopicIds = null,
  replaceSyncTopicIds = false,
}) => {
  const update = {
    $set: {
      channelTitle: channelTitle || "",
      autoSync: Boolean(autoSync),
      lastSyncedAt: new Date(),
    },
    $setOnInsert: { channelId: String(channelId), programmeId },
  };
  if (lastSyncedMessageId != null) {
    update.$set.lastSyncedMessageId = lastSyncedMessageId;
  }
  if (importedCount) {
    update.$inc = { totalImported: importedCount };
  }
  if (Array.isArray(syncTopicIds)) {
    const normalized = [...new Set(syncTopicIds.map(Number).filter(Boolean))];
    if (replaceSyncTopicIds) {
      update.$set.syncTopicIds = normalized;
    } else if (normalized.length) {
      update.$addToSet = { syncTopicIds: { $each: normalized } };
    }
  }

  return TelegramChannelMapping.findOneAndUpdate(
    { channelId: String(channelId), programmeId },
    update,
    { upsert: true, new: true }
  );
};

export const pruneChannelSubjectsOutsideTopics = async ({
  programmeId,
  channelId,
  allowedTopicIds = [],
}) => {
  const allowed = new Set(allowedTopicIds.map(Number).filter(Boolean));
  if (!allowed.size) {
    return { deletedSubjects: 0, deletedContents: 0 };
  }

  const subjects = await Subject.find({
    programmeId,
    telegramChannelId: String(channelId),
  });

  let deletedSubjects = 0;
  let deletedContents = 0;

  for (const subject of subjects) {
    const topicId = Number(subject.telegramTopicId);
    if (!topicId || allowed.has(topicId)) continue;
    const result = await deleteSubjectTree(subject._id);
    if (result.deleted) {
      deletedSubjects += 1;
      deletedContents += result.deletedContents || 0;
    }
  }

  return { deletedSubjects, deletedContents };
};

export const fetchChannelMapping = async ({ channelId, programmeId }) =>
  TelegramChannelMapping.findOne({ channelId: String(channelId), programmeId });

export const listChannelMappings = async (programmeId) =>
  TelegramChannelMapping.find({ programmeId }).sort({ updatedAt: -1 });

const LESSONS_CHAPTER = "Lessons";

const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length || 0) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

const buildTelegramContentPayload = async ({
  channelId,
  meta,
  subject,
  chapter,
  title,
  topicId = null,
  uploadId = null,
  mediaFileIndex = 0,
  mediaFilesTotal = 1,
  pdfFileIndex = null,
  pdfFilesTotal = null,
  importSortOrder = null,
}) => {
  const fileIndex = pdfFileIndex != null ? pdfFileIndex : mediaFileIndex;
  const filesTotal = pdfFilesTotal != null ? pdfFilesTotal : mediaFilesTotal;
  const messageId = Number(meta.messageId);
  const base = {
    subjectId: subject._id,
    chapterId: chapter._id,
    title,
    type: meta.mediaType === "video" ? "video" : "pdf",
    telegramSource: true,
    telegramChannelId: String(channelId),
    telegramMessageId: messageId,
    telegramFileName: meta.fileName,
    telegramMimeType: meta.mimeType,
    telegramFileSize: meta.size,
    uploadedAt: meta.uploadDate ? new Date(meta.uploadDate) : new Date(),
    ...(topicId != null ? { telegramTopicId: topicId } : {}),
    ...(importSortOrder != null ? { importSortOrder } : {}),
  };

  if (meta.mediaType === "video") {
    return {
      ...base,
      sourceType: "telegram",
      videoSourceType: "telegram",
      duration: meta.duration ?? null,
    };
  }

  const pdfFields = await buildTelegramPdfContentFields({
    channelId,
    meta,
    subject,
    uploadId,
    fileIndex,
    filesTotal,
  });

  return { ...base, ...pdfFields };
};

export const getOrCreateSubjectForTopic = async ({
  programmeId,
  channelId,
  topicId,
  topicTitle,
}) => {
  const name = String(topicTitle || "").trim();
  if (!name) throw new Error("Topic title is empty");

  let subject = await Subject.findOne({
    programmeId,
    telegramChannelId: String(channelId),
    telegramTopicId: Number(topicId),
  });
  if (subject) {
    if (subject.name !== name) {
      subject.name = name;
      await subject.save();
    }
    return subject;
  }

  const byName = await Subject.findOne({ programmeId, name });
  if (byName) {
    const existingTopicId = byName.telegramTopicId != null ? Number(byName.telegramTopicId) : null;
    const nextTopicId = Number(topicId);
    if (existingTopicId == null) {
      byName.telegramChannelId = String(channelId);
      byName.telegramTopicId = nextTopicId;
      await byName.save();
      return byName;
    }
    if (existingTopicId === nextTopicId) {
      if (byName.telegramChannelId !== String(channelId)) {
        byName.telegramChannelId = String(channelId);
        await byName.save();
      }
      return byName;
    }
  }

  let createName = name;
  const taken = await Subject.findOne({ programmeId, name: createName });
  if (taken) {
    createName = `${name} (Topic ${topicId})`;
  }

  try {
    return await Subject.create({
      programmeId,
      name: createName,
      telegramChannelId: String(channelId),
      telegramTopicId: Number(topicId),
    });
  } catch (err) {
    if (err?.code === 11000) {
      const retry = await Subject.findOne({
        programmeId,
        telegramChannelId: String(channelId),
        telegramTopicId: Number(topicId),
      });
      if (retry) return retry;
    }
    throw err;
  }
};

export const cleanupChannelImport = async ({ programmeId, channelId }) => {
  const cid = String(channelId);
  const programmeSubjects = await Subject.find({ programmeId }).select("_id");
  const progSubjectIds = programmeSubjects.map((s) => s._id);

  const contentFilter = {
    telegramChannelId: cid,
    subjectId: { $in: progSubjectIds },
  };

  const affectedSubjectIds = await Content.distinct("subjectId", contentFilter);

  const contentCleanup = await deleteContentsWithAssets(contentFilter);
  const contentResult = { deletedCount: contentCleanup.deletedContents };

  let cleanedSubjects = 0;
  for (const sid of affectedSubjectIds) {
    const remaining = await Content.countDocuments({ subjectId: sid });
    if (remaining === 0) {
      await Subject.deleteOne({ _id: sid });
      cleanedSubjects += 1;
    }
  }

  const mappedSubjects = await Subject.find({
    programmeId,
    telegramChannelId: cid,
  });
  for (const sub of mappedSubjects) {
    const count = await Content.countDocuments({ subjectId: sub._id });
    if (count === 0) {
      await Subject.deleteOne({ _id: sub._id });
      cleanedSubjects += 1;
    }
  }

  return { deletedContents: contentResult.deletedCount, cleanedSubjects };
};

export const fetchForumTopicsPreview = async ({ channelId }) => {
  const topics = await fetchForumTopicsForChannel(channelId);
  const allMessageIds = [];

  const topicMedia = await mapWithConcurrency(topics, 4, async (topic) => {
    const media = await fetchMediaInTopic({ channelId, topicId: topic.id });
    media.forEach((m) => allMessageIds.push(m.messageId));
    return { ...topic, media, mediaCount: media.length };
  });

  const importedRows = await Content.find({
    telegramChannelId: String(channelId),
    telegramMessageId: { $in: allMessageIds },
  }).select("_id telegramMessageId telegramTopicId");

  const isImportedInTopic = (topicId, messageId) =>
    importedRows.some(
      (row) =>
        Number(row.telegramMessageId) === Number(messageId) &&
        (row.telegramTopicId == null || Number(row.telegramTopicId) === Number(topicId))
    );

  const findImportedRow = (topicId, messageId) =>
    importedRows.find(
      (row) =>
        Number(row.telegramMessageId) === Number(messageId) &&
        (row.telegramTopicId == null || Number(row.telegramTopicId) === Number(topicId))
    );

  const enriched = topicMedia.map((topic) => ({
    id: topic.id,
    title: topic.title,
    mediaCount: topic.mediaCount,
    importedCount: topic.media.filter((m) => isImportedInTopic(topic.id, m.messageId)).length,
    newCount: topic.media.filter((m) => !isImportedInTopic(topic.id, m.messageId)).length,
    media: topic.media
      .map((item) => {
        const row = findImportedRow(topic.id, item.messageId);
        return {
          ...item,
          imported: Boolean(row),
          contentId: row?._id || null,
        };
      })
      .sort((a, b) => a.messageId - b.messageId),
  }));

  const totalMedia = enriched.reduce((sum, t) => sum + t.mediaCount, 0);
  const totalImported = enriched.reduce((sum, t) => sum + t.importedCount, 0);

  return {
    isForum: enriched.length > 0,
    topics: enriched,
    totalMedia,
    totalImported,
    totalNew: totalMedia - totalImported,
  };
};

export const importBatchByForumTopics = async ({
  channelId,
  channelTitle,
  programmeId,
  autoSync = true,
  cleanSync = false,
  topicIds = null,
  uploadId = null,
  pruneUnselectedTopics = false,
}) => {
  if (cleanSync) {
    await cleanupChannelImport({ programmeId, channelId });
  }

  let topics = await fetchForumTopicsForChannel(channelId);
  if (Array.isArray(topicIds) && topicIds.length) {
    const allowed = new Set(topicIds.map(Number));
    topics = topics.filter((t) => allowed.has(t.id));
    const foundIds = new Set(topics.map((t) => t.id));
    const missingIds = topicIds.map(Number).filter((id) => !foundIds.has(id));
    if (missingIds.length) {
      const resolved = await fetchForumTopicsByIds(channelId, missingIds);
      topics.push(...resolved.filter((t) => allowed.has(t.id)));
    }
  }

  if (!topics.length) {
    throw new Error("No forum topics found. This channel may not use Telegram Topics.");
  }

  const created = [];
  const skipped = [];
  let maxMessageId = 0;

  const allMedia = [];
  for (const topic of topics) {
    const mediaItems = await fetchMediaInTopic({ channelId, topicId: topic.id });
    allMedia.push(...mediaItems.map((m) => ({ ...m, topicId: topic.id, topicTitle: topic.title })));
  }
  const mediaTotal = allMedia.filter(
    (m) => m.mediaType === "pdf" || m.mediaType === "video"
  ).length;

  if (uploadId) {
    initProgress(uploadId, {
      phase: "pending",
      message: "Preparing subject import…",
      filesTotal: mediaTotal,
      fileIndex: 0,
    });
  }
  let mediaIndex = 0;

  for (const topic of topics) {
    const subject = await getOrCreateSubjectForTopic({
      programmeId,
      channelId,
      topicId: topic.id,
      topicTitle: topic.title,
    });

    const chapter = await getOrCreateChapterForSubject(subject._id, LESSONS_CHAPTER);
    const mediaItems = await fetchMediaInTopic({ channelId, topicId: topic.id });

    for (const meta of mediaItems) {
      const messageId = Number(meta.messageId);
      if (!messageId) continue;
      maxMessageId = Math.max(maxMessageId, messageId);

      const existing = await Content.findOne({
        telegramChannelId: String(channelId),
        telegramMessageId: messageId,
        telegramTopicId: Number(topic.id),
      });
      if (existing) {
        skipped.push({ messageId, fileName: meta.fileName, reason: "Already imported" });
        continue;
      }

      const title = resolveTelegramMediaTitle(meta) || `Lesson ${messageId}`;

      if (uploadId) {
        setProgress(uploadId, {
          message: `Processing ${topic.title}`,
          currentFile: meta.displayName || meta.fileName,
        });
      }

      const payload = await buildTelegramContentPayload({
        channelId,
        meta,
        subject,
        chapter,
        title,
        topicId: topic.id,
        uploadId,
        mediaFileIndex:
          meta.mediaType === "pdf" || meta.mediaType === "video" ? mediaIndex++ : 0,
        mediaFilesTotal: mediaTotal,
      });

      const doc = await Content.create(payload);

      created.push({
        ...doc.toObject(),
        subjectName: subject.name,
        topicTitle: topic.title,
      });
    }
  }

  let pruneResult = { deletedSubjects: 0, deletedContents: 0 };
  if (pruneUnselectedTopics && Array.isArray(topicIds) && topicIds.length) {
    pruneResult = await pruneChannelSubjectsOutsideTopics({
      programmeId,
      channelId,
      allowedTopicIds: topicIds,
    });
  }

  const isPartialTopicImport = Array.isArray(topicIds) && topicIds.length > 0;
  const mapping = await upsertChannelMapping({
    channelId,
    channelTitle,
    programmeId,
    autoSync,
    lastSyncedMessageId: maxMessageId,
    importedCount: created.length,
    syncTopicIds: topics.map((topic) => topic.id),
    replaceSyncTopicIds: !isPartialTopicImport,
  });

  if (uploadId) {
    completeProgress(uploadId, {
      message: `Imported ${created.length} item(s) from ${topics.length} subject(s)`,
      filesTotal: mediaTotal,
      fileIndex: mediaTotal,
    });
  }

  return {
    created,
    skipped,
    maxMessageId,
    topicsProcessed: topics.length,
    mapping,
    pruned: pruneResult,
  };
};

export const importSelectedForumMessages = async ({
  channelId,
  channelTitle,
  programmeId,
  selectedItems = [],
  autoSync = true,
  uploadId = null,
}) => {
  if (!Array.isArray(selectedItems) || !selectedItems.length) {
    throw new Error("No files selected for import.");
  }

  const topics = await fetchForumTopicsForChannel(channelId);
  const topicById = new Map(topics.map((t) => [Number(t.id), t]));

  const created = [];
  const skipped = [];
  let maxMessageId = 0;

  const metas = [];
  for (const item of selectedItems) {
    const topicId = Number(item.topicId);
    const messageId = Number(item.messageId);
    if (!topicId || !messageId) continue;
    try {
      const { meta } = await getTelegramMessageMedia({ channelId, messageId, topicId });
      metas.push({
        ...meta,
        topicId,
        topicTitle: item.topicTitle || topicById.get(topicId)?.title || "Subject",
        preferredTitle: String(item.displayName || "").trim() || null,
      });
    } catch {
      skipped.push({ messageId, reason: "Could not fetch message" });
    }
  }

  const mediaTotal = metas.filter(
    (m) => m.mediaType === "pdf" || m.mediaType === "video"
  ).length;
  let mediaIndex = 0;
  if (uploadId) {
    initProgress(uploadId, {
      phase: "pending",
      message: "Preparing file import…",
      filesTotal: metas.length,
      fileIndex: 0,
    });
  }

  for (let sortOrder = 0; sortOrder < metas.length; sortOrder++) {
    const meta = metas[sortOrder];
    const messageId = Number(meta.messageId);
    const topicId = Number(meta.topicId);
    maxMessageId = Math.max(maxMessageId, messageId);

    const existing = await Content.findOne({
      telegramChannelId: String(channelId),
      telegramMessageId: messageId,
      telegramTopicId: Number(topicId),
    });
    if (existing) {
      skipped.push({ messageId, fileName: meta.fileName, reason: "Already imported" });
      continue;
    }

    const subject = await getOrCreateSubjectForTopic({
      programmeId,
      channelId,
      topicId,
      topicTitle: meta.topicTitle,
    });
    const chapter = await getOrCreateChapterForSubject(subject._id, LESSONS_CHAPTER);
    const title =
      meta.preferredTitle ||
      resolveTelegramMediaTitle(meta) ||
      `Lesson ${messageId}`;

    if (uploadId) {
      setProgress(uploadId, {
        phase: meta.mediaType === "pdf" ? "uploading" : "importing",
        message: `Importing ${meta.displayName || meta.fileName}`,
        currentFile: meta.displayName || meta.fileName,
        fileIndex: sortOrder + 1,
        filesTotal: metas.length,
        percent: Math.round(((sortOrder + 0.2) / metas.length) * 100),
      });
    }

    const payload = await buildTelegramContentPayload({
      channelId,
      meta,
      subject,
      chapter,
      title,
      topicId,
      uploadId,
      mediaFileIndex:
        meta.mediaType === "pdf" || meta.mediaType === "video" ? mediaIndex++ : 0,
      mediaFilesTotal: mediaTotal || metas.length,
      importSortOrder: sortOrder,
    });

    const doc = await Content.create(payload);
    created.push({
      ...doc.toObject(),
      subjectName: subject.name,
      topicTitle: meta.topicTitle,
    });
  }

  const selectedTopicIds = [
    ...new Set(selectedItems.map((item) => Number(item.topicId)).filter(Boolean)),
  ];

  const mapping = await upsertChannelMapping({
    channelId,
    channelTitle,
    programmeId,
    autoSync,
    lastSyncedMessageId: maxMessageId,
    importedCount: created.length,
    syncTopicIds: selectedTopicIds,
    replaceSyncTopicIds: false,
  });

  if (uploadId) {
    completeProgress(uploadId, {
      message: `Imported ${created.length} selected file(s)`,
      filesTotal: metas.length,
      fileIndex: metas.length,
    });
  }

  return {
    created,
    skipped,
    maxMessageId,
    topicsProcessed: new Set(metas.map((m) => m.topicId)).size,
    mapping,
  };
};

/** Check which programme subjects have new Telegram media not yet imported. */
export const getProgrammeSubjectUpdates = async ({ programmeId }) => {
  const mapping = await TelegramChannelMapping.findOne({ programmeId }).sort({ updatedAt: -1 });
  if (!mapping) {
    return {
      available: false,
      reason: "Import this batch from Telegram first.",
      channelId: null,
      subjects: [],
      totalNew: 0,
      subjectsWithUpdates: 0,
    };
  }

  const session = await getActiveSession();
  if (!session?.isActive) {
    return {
      available: false,
      reason: "Connect Telegram to check for updates.",
      channelId: mapping.channelId,
      subjects: [],
      totalNew: 0,
      subjectsWithUpdates: 0,
    };
  }

  const batchSubjects = await Subject.find({
    programmeId,
    telegramTopicId: { $ne: null },
  }).select("_id name telegramTopicId telegramChannelId programmeId");

  if (!batchSubjects.length) {
    return {
      available: false,
      reason: "No Telegram-linked subjects in this batch.",
      channelId: mapping.channelId,
      subjects: [],
      totalNew: 0,
      subjectsWithUpdates: 0,
    };
  }

  const preview = await fetchForumTopicsPreview({ channelId: mapping.channelId });
  const topicById = new Map(preview.topics.map((t) => [Number(t.id), t]));

  const subjects = batchSubjects.map((sub) => {
    const topicId = Number(sub.telegramTopicId);
    let topic = topicById.get(topicId);
    if (!topic) {
      topic = preview.topics.find(
        (t) => t.title.trim().toLowerCase() === sub.name.trim().toLowerCase()
      );
    }
    const newMedia = (topic?.media || []).filter((m) => !m.imported);
    const newCount = topic?.newCount ?? newMedia.length;
    return {
      subjectId: String(sub._id),
      subjectName: sub.name,
      topicId: Number(sub.telegramTopicId),
      newCount,
      hasUpdate: newCount > 0,
      newVideos: newMedia.filter((m) => m.mediaType === "video").length,
      newPdfs: newMedia.filter((m) => m.mediaType === "pdf").length,
      topicTitle: topic?.title || sub.name,
    };
  });

  const totalNew = subjects.reduce((sum, s) => sum + s.newCount, 0);
  const subjectsWithUpdates = subjects.filter((s) => s.hasUpdate).length;

  return {
    available: true,
    channelId: mapping.channelId,
    channelTitle: mapping.channelTitle,
    totalNew,
    subjectsWithUpdates,
    subjects,
  };
};

/** Import new Telegram media for one or more subjects (by subjectId or all with updates). */
export const updateProgrammeSubjects = async ({
  programmeId,
  subjectId = null,
  subjectIds = null,
  allWithUpdates = false,
}) => {
  let mapping = await TelegramChannelMapping.findOne({ programmeId }).sort({ updatedAt: -1 });

  const session = await getActiveSession();
  if (!session?.isActive) {
    throw new Error("Telegram is not connected. Connect in Add from Telegram.");
  }

  let topicIds = [];
  let channelId = mapping?.channelId || null;
  let channelTitle = mapping?.channelTitle || "";

  if (allWithUpdates) {
    const status = await getProgrammeSubjectUpdates({ programmeId });
    if (!status.available) {
      throw new Error(status.reason || "Cannot check for updates.");
    }
    topicIds = status.subjects.filter((s) => s.hasUpdate).map((s) => s.topicId);
    channelId = channelId || status.channelId;
    if (!topicIds.length) {
      return { created: [], skipped: [], imported: 0, message: "All subjects are up to date." };
    }
  } else {
    const ids = subjectIds?.length
      ? subjectIds
      : subjectId
        ? [subjectId]
        : [];
    if (!ids.length) {
      throw new Error("subjectId or subjectIds is required.");
    }

    const subjects = await Subject.find({
      _id: { $in: ids },
      programmeId,
      telegramTopicId: { $ne: null },
    }).select("telegramTopicId telegramChannelId name");

    topicIds = subjects.map((s) => Number(s.telegramTopicId)).filter(Boolean);
    if (!topicIds.length) {
      throw new Error("Subject is not linked to a Telegram topic. Re-add it from Telegram.");
    }
    channelId = channelId || subjects.find((s) => s.telegramChannelId)?.telegramChannelId;
  }

  if (!channelId) {
    throw new Error("No Telegram channel linked to this batch. Import from Telegram first.");
  }

  const result = await importBatchByForumTopics({
    channelId,
    channelTitle,
    programmeId,
    autoSync: mapping?.autoSync ?? true,
    cleanSync: false,
    topicIds,
  });

  return {
    imported: result.created.length,
    skipped: result.skipped.length,
    created: result.created,
    skippedItems: result.skipped,
    topicsProcessed: result.topicsProcessed,
    message:
      result.created.length > 0
        ? `Imported ${result.created.length} new file(s).`
        : "No new files to import.",
  };
};
