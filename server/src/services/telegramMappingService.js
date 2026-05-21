import Chapter from "../models/Chapter.js";
import Content from "../models/Content.js";
import Subject from "../models/Subject.js";
import TelegramChannelMapping from "../models/TelegramChannelMapping.js";
import { getOrCreateChapterForSubject } from "../utils/chapterHelpers.js";
import { parseChapterAndTitleFromFilename } from "../utils/contentHelpers.js";
import { resolveTelegramMediaTitle, getTelegramMessageMedia, fetchForumTopicsForChannel, fetchForumTopicsByIds, fetchMediaInTopic } from "./telegramService.js";
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

  const pdfMessages = messages.filter((m) => m.mediaType === "pdf");
  if (uploadId) {
    initProgress(uploadId, {
      phase: "pending",
      message: "Preparing Telegram import…",
      filesTotal: pdfMessages.length,
      fileIndex: 0,
    });
  }
  let pdfIndex = 0;

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
      pdfFileIndex: meta.mediaType === "pdf" ? pdfIndex++ : 0,
      pdfFilesTotal: pdfMessages.length,
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
      filesTotal: pdfMessages.length,
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

  return TelegramChannelMapping.findOneAndUpdate(
    { channelId: String(channelId), programmeId },
    update,
    { upsert: true, new: true }
  );
};

export const fetchChannelMapping = async ({ channelId, programmeId }) =>
  TelegramChannelMapping.findOne({ channelId: String(channelId), programmeId });

export const listChannelMappings = async (programmeId) =>
  TelegramChannelMapping.find({ programmeId }).sort({ updatedAt: -1 });

const LESSONS_CHAPTER = "Lessons";

const buildTelegramContentPayload = async ({
  channelId,
  meta,
  subject,
  chapter,
  title,
  topicId = null,
  uploadId = null,
  pdfFileIndex = 0,
  pdfFilesTotal = 1,
  importSortOrder = null,
}) => {
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
    fileIndex: pdfFileIndex,
    filesTotal: pdfFilesTotal,
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
    byName.telegramChannelId = String(channelId);
    byName.telegramTopicId = Number(topicId);
    await byName.save();
    return byName;
  }

  try {
    return await Subject.create({
      programmeId,
      name,
      telegramChannelId: String(channelId),
      telegramTopicId: Number(topicId),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return Subject.findOne({ programmeId, name });
    }
    throw err;
  }
};

export const cleanupChannelImport = async ({ programmeId, channelId }) => {
  const cid = String(channelId);
  const programmeSubjects = await Subject.find({ programmeId }).select("_id");
  const progSubjectIds = programmeSubjects.map((s) => s._id);

  const affectedSubjectIds = await Content.distinct("subjectId", {
    telegramChannelId: cid,
    subjectId: { $in: progSubjectIds },
  });

  const contentResult = await Content.deleteMany({
    telegramChannelId: cid,
    subjectId: { $in: progSubjectIds },
  });

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
  const topicMedia = [];
  const allMessageIds = [];

  for (const topic of topics) {
    const media = await fetchMediaInTopic({ channelId, topicId: topic.id });
    media.forEach((m) => allMessageIds.push(m.messageId));
    topicMedia.push({ ...topic, media, mediaCount: media.length });
  }

  const importedMap = await getImportedContentMap(channelId, allMessageIds);

  const enriched = topicMedia.map((topic) => ({
    id: topic.id,
    title: topic.title,
    mediaCount: topic.mediaCount,
    importedCount: topic.media.filter((m) => importedMap.has(m.messageId)).length,
    newCount: topic.media.filter((m) => !importedMap.has(m.messageId)).length,
    media: topic.media
      .map((item) => ({
        ...item,
        imported: importedMap.has(item.messageId),
        contentId: importedMap.get(item.messageId)?.contentId || null,
      }))
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
  const pdfTotal = allMedia.filter((m) => m.mediaType === "pdf").length;

  if (uploadId) {
    initProgress(uploadId, {
      phase: "pending",
      message: "Preparing subject import…",
      filesTotal: pdfTotal,
      fileIndex: 0,
    });
  }
  let pdfIndex = 0;

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
        pdfFileIndex: meta.mediaType === "pdf" ? pdfIndex++ : 0,
        pdfFilesTotal: pdfTotal,
      });

      const doc = await Content.create(payload);

      created.push({
        ...doc.toObject(),
        subjectName: subject.name,
        topicTitle: topic.title,
      });
    }
  }

  const mapping = await upsertChannelMapping({
    channelId,
    channelTitle,
    programmeId,
    autoSync,
    lastSyncedMessageId: maxMessageId,
    importedCount: created.length,
  });

  if (uploadId) {
    completeProgress(uploadId, {
      message: `Imported ${created.length} item(s) from ${topics.length} subject(s)`,
      filesTotal: pdfTotal,
      fileIndex: pdfTotal,
    });
  }

  return {
    created,
    skipped,
    maxMessageId,
    topicsProcessed: topics.length,
    mapping,
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
  let pdfIndex = 0;

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

  const pdfTotal = metas.filter((m) => m.mediaType === "pdf").length;
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
      pdfFileIndex: meta.mediaType === "pdf" ? pdfIndex++ : 0,
      pdfFilesTotal: pdfTotal,
      importSortOrder: sortOrder,
    });

    const doc = await Content.create(payload);
    created.push({
      ...doc.toObject(),
      subjectName: subject.name,
      topicTitle: meta.topicTitle,
    });
  }

  const mapping = await upsertChannelMapping({
    channelId,
    channelTitle,
    programmeId,
    autoSync,
    lastSyncedMessageId: maxMessageId,
    importedCount: created.length,
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
