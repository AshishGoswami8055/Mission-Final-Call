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
  fetchNewChannelMediaSince,
  getActiveSession,
} from "./telegramService.js";
import { deleteContentsWithAssets } from "./contentCleanupService.js";
import { deleteSubjectTree } from "./subjectCleanupService.js";
import { buildTelegramPdfContentFields } from "./telegramPdfImportService.js";
import {
  completeProgress,
  failProgress,
  initProgress,
  setProgress,
  throwIfCancelled,
} from "./uploadProgressBus.js";
import {
  normalizeTopicMediaPrefs,
  persistSubjectMediaPrefs,
  resolveTopicMediaPrefs,
  shouldImportTelegramMedia,
} from "../utils/telegramImportMediaPrefs.js";
import {
  appendSkippedMessageIds,
  buildTitleKeysBySubjectId,
  createSubjectImportFilter,
  evaluateTelegramImportSkip,
  registerImportedTitleKeys,
} from "../utils/telegramImportFilters.js";
import {
  filterSubjectKeysForSyncWrite,
  filterTopicIdsForSyncWrite,
  isTopicBlocked,
  reconcileBlockedTopicsForProgramme,
  unblockTelegramSubjectsForImport,
} from "./telegramSubjectBlocklist.js";
import {
  isVirtualFlatTopicId,
  inferFlatChannelSubjectKey,
  subjectKeyToVirtualTopicId,
} from "../utils/telegramFlatChannel.js";
import {
  findExistingTelegramContentInProgramme,
  findImportedContentRowsForProgramme,
  getProgrammeTelegramScope,
  topicInProgrammeCourse,
} from "../utils/telegramProgrammeScope.js";

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

export const getImportedContentMap = async (channelId, messageIds = [], programmeId = null) => {
  if (!messageIds.length) return new Map();
  const rows = programmeId
    ? await findImportedContentRowsForProgramme({
        programmeId,
        channelId,
        messageIds,
      })
    : await Content.find({
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

    const existing = programmeId
      ? await findExistingTelegramContentInProgramme({
          programmeId,
          channelId,
          messageId,
        })
      : await Content.findOne({
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
  channelMode = null,
  syncSubjectKeys = null,
}) => {
  const update = {
    $set: {
      channelTitle: channelTitle || "",
      autoSync: Boolean(autoSync),
      lastSyncedAt: new Date(),
    },
    $setOnInsert: { channelId: String(channelId), programmeId },
  };
  if (channelMode) {
    update.$set.channelMode = channelMode;
  }
  if (lastSyncedMessageId != null) {
    update.$set.lastSyncedMessageId = lastSyncedMessageId;
  }
  if (importedCount) {
    update.$inc = { totalImported: importedCount };
  }
  if (Array.isArray(syncTopicIds)) {
    let normalized = await filterTopicIdsForSyncWrite({ programmeId, topicIds: syncTopicIds });
    if (replaceSyncTopicIds) {
      update.$set.syncTopicIds = normalized;
    } else if (normalized.length) {
      update.$addToSet = { syncTopicIds: { $each: normalized } };
    }
  }
  if (Array.isArray(syncSubjectKeys)) {
    const keys = await filterSubjectKeysForSyncWrite({ programmeId, subjectKeys: syncSubjectKeys });
    if (keys.length) {
      update.$set.syncSubjectKeys = keys;
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

export const buildTelegramContentPayload = async ({
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
  allowBlockedRecreate = false,
}) => {
  const name = String(topicTitle || "").trim();
  if (!name) throw new Error("Topic title is empty");

  const numericTopicId = Number(topicId);
  const blocked = await isTopicBlocked({ programmeId, topicId: numericTopicId });
  if (blocked && !allowBlockedRecreate) return null;
  if (blocked && allowBlockedRecreate) {
    await unblockTelegramSubjectsForImport({ programmeId, topicIds: [numericTopicId] });
  }

  let subject = await Subject.findOne({
    programmeId,
    telegramChannelId: String(channelId),
    telegramTopicId: numericTopicId,
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
    const nextTopicId = numericTopicId;
    const existingChannel = byName.telegramChannelId ? String(byName.telegramChannelId) : null;
    if (existingChannel && existingChannel !== String(channelId)) {
      return null;
    }
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

const buildImportedLookup = (importedRows = []) => {
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

  return { isImportedInTopic, findImportedRow };
};

/** Fast preview: topic list + DB import counts only (avoids Cloudflare 524 timeouts). */
export const fetchForumTopicsPreviewSummary = async ({ channelId, programmeId = null }) => {
  let forumTopics = [];
  try {
    forumTopics = await fetchForumTopicsForChannel(channelId, { skipDiscovery: true });
  } catch {
    forumTopics = [];
  }

  const scope = programmeId ? await getProgrammeTelegramScope(programmeId, channelId) : null;

  if (forumTopics.length > 0) {
    const importedRows = programmeId
      ? await findImportedContentRowsForProgramme({
          programmeId,
          channelId,
          subjectIds: scope?.subjectIds,
          requireTopicId: true,
        })
      : await Content.find({
          telegramChannelId: String(channelId),
          telegramTopicId: { $ne: null },
        }).select("_id telegramMessageId telegramTopicId");

    const importedByTopic = new Map();
    for (const row of importedRows) {
      const topicId = Number(row.telegramTopicId);
      if (!topicId) continue;
      importedByTopic.set(topicId, (importedByTopic.get(topicId) || 0) + 1);
    }

    const enriched = forumTopics.map((topic) => {
      const importedCount = importedByTopic.get(Number(topic.id)) || 0;
      const inCourse = programmeId
        ? topicInProgrammeCourse(scope, topic) || importedCount > 0
        : importedCount > 0;
      return {
        id: topic.id,
        title: topic.title,
        mediaCount: importedCount,
        importedCount,
        inCourse,
        newCount: 0,
        media: [],
        mediaLoaded: false,
      };
    });

    const totalImported = enriched.reduce((sum, t) => sum + t.importedCount, 0);
    const inCourseCount = enriched.filter((t) => t.inCourse).length;

    return {
      isForum: true,
      channelMode: "forum",
      topics: enriched,
      totalMedia: totalImported,
      totalImported,
      totalNew: 0,
      inCourseCount,
      summaryOnly: true,
    };
  }

  const { fetchFlatChannelSubjectsPreviewSummary } = await import("./telegramFlatChannelService.js");
  return fetchFlatChannelSubjectsPreviewSummary({ channelId, programmeId });
};

/** Load lessons for one subject/topic (lazy, after summary preview). */
export const fetchTopicMediaPreview = async ({ channelId, topicId, programmeId = null }) => {
  const mediaItems = await fetchMediaInTopic({ channelId, topicId: Number(topicId) });
  const messageIds = mediaItems.map((m) => m.messageId);

  const scope = programmeId ? await getProgrammeTelegramScope(programmeId, channelId) : null;
  const importedRows = programmeId
    ? await findImportedContentRowsForProgramme({
        programmeId,
        channelId,
        messageIds,
        subjectIds: scope?.subjectIds,
      })
    : await Content.find({
        telegramChannelId: String(channelId),
        telegramMessageId: { $in: messageIds },
      }).select("_id telegramMessageId telegramTopicId");

  const { isImportedInTopic, findImportedRow } = buildImportedLookup(importedRows);
  const tid = Number(topicId);

  const media = mediaItems
    .map((item) => {
      const row = findImportedRow(tid, item.messageId);
      return {
        ...item,
        imported: Boolean(row),
        contentId: row?._id || null,
      };
    })
    .sort((a, b) => a.messageId - b.messageId);

  const importedCount = media.filter((m) => isImportedInTopic(tid, m.messageId)).length;
  const inCourse =
    programmeId && scope
      ? topicInProgrammeCourse(scope, { id: tid }) || importedCount > 0
      : importedCount > 0;

  let newCount = media.length - importedCount;
  if (programmeId && scope) {
    const subject = scope.subjectByTopicId.get(tid);
    if (subject) {
      const contentRows = await Content.find({ subjectId: subject._id }).select("subjectId title").lean();
      const filter = createSubjectImportFilter(subject, buildTitleKeysBySubjectId(contentRows));
      newCount = media.filter((row) => {
        if (row.imported) return false;
        return !evaluateTelegramImportSkip(row, filter).skip;
      }).length;
    }
  }

  return {
    id: tid,
    media,
    mediaCount: media.length,
    importedCount,
    inCourse,
    newCount,
    mediaLoaded: true,
  };
};

export const fetchForumTopicsPreview = async ({ channelId, programmeId = null }) => {
  let forumTopics = [];
  try {
    forumTopics = await fetchForumTopicsForChannel(channelId, { skipDiscovery: true });
  } catch {
    forumTopics = [];
  }

  const scope = programmeId ? await getProgrammeTelegramScope(programmeId, channelId) : null;

  if (forumTopics.length > 0) {
    const allMessageIds = [];

    const topicMedia = await mapWithConcurrency(forumTopics, 4, async (topic) => {
      const media = await fetchMediaInTopic({ channelId, topicId: topic.id });
      media.forEach((m) => allMessageIds.push(m.messageId));
      return { ...topic, media, mediaCount: media.length };
    });

    const importedRows = programmeId
      ? await findImportedContentRowsForProgramme({
          programmeId,
          channelId,
          messageIds: allMessageIds,
          subjectIds: scope?.subjectIds,
        })
      : await Content.find({
          telegramChannelId: String(channelId),
          telegramMessageId: { $in: allMessageIds },
        }).select("_id telegramMessageId telegramTopicId");

    const { isImportedInTopic, findImportedRow } = buildImportedLookup(importedRows);

    const enriched = topicMedia.map((topic) => {
      const importedCount = topic.media.filter((m) => isImportedInTopic(topic.id, m.messageId)).length;
      const inCourse =
        programmeId && scope
          ? topicInProgrammeCourse(scope, topic) || importedCount > 0
          : importedCount > 0;
      return {
        id: topic.id,
        title: topic.title,
        mediaCount: topic.mediaCount,
        importedCount,
        inCourse,
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
        mediaLoaded: true,
      };
    });

    const totalMedia = enriched.reduce((sum, t) => sum + t.mediaCount, 0);
    const totalImported = enriched.reduce((sum, t) => sum + t.importedCount, 0);

    return {
      isForum: true,
      channelMode: "forum",
      topics: enriched,
      totalMedia,
      totalImported,
      totalNew: totalMedia - totalImported,
    };
  }

  const { fetchFlatChannelSubjectsPreview } = await import("./telegramFlatChannelService.js");
  return fetchFlatChannelSubjectsPreview({ channelId, programmeId });
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
  existingSubjectsOnly = false,
  allowBlockedRecreate = false,
  topicMediaPrefs = null,
}) => {
  const topicMediaPrefsMap = normalizeTopicMediaPrefs(topicMediaPrefs);
  if (allowBlockedRecreate && Array.isArray(topicIds) && topicIds.length) {
    await unblockTelegramSubjectsForImport({ programmeId, topicIds });
  }

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

  const mediaByTopicId = new Map();
  for (const topic of topics) {
    const mediaItems = await fetchMediaInTopic({ channelId, topicId: topic.id });
    mediaByTopicId.set(topic.id, mediaItems);
  }
  const mediaTotal = topics.reduce((sum, topic) => {
    const prefs = resolveTopicMediaPrefs(topic.id, topicMediaPrefsMap);
    const items = mediaByTopicId.get(topic.id) || [];
    return sum + items.filter((m) => shouldImportTelegramMedia(m, prefs)).length;
  }, 0);

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
    throwIfCancelled(uploadId);
    let subject;
    if (existingSubjectsOnly) {
      subject = await Subject.findOne({
        programmeId,
        telegramChannelId: String(channelId),
        telegramTopicId: Number(topic.id),
      });
      if (!subject) continue;
    } else {
      subject = await getOrCreateSubjectForTopic({
        programmeId,
        channelId,
        topicId: topic.id,
        topicTitle: topic.title,
        allowBlockedRecreate,
      });
      if (!subject) continue;
    }

    const chapter = await getOrCreateChapterForSubject(subject._id, LESSONS_CHAPTER);
    const mediaItems = mediaByTopicId.get(topic.id) || [];
    const prefs = resolveTopicMediaPrefs(topic.id, topicMediaPrefsMap, subject);
    await persistSubjectMediaPrefs(subject, prefs);

    const subjectContentRows = await Content.find({ subjectId: subject._id })
      .select("subjectId title")
      .lean();
    const importFilter = createSubjectImportFilter(
      subject,
      buildTitleKeysBySubjectId(subjectContentRows),
      topicMediaPrefsMap
    );
    const persistSkippedIds = [];

    let topicSortOrder = 0;
    for (const meta of mediaItems) {
      throwIfCancelled(uploadId);
      const messageId = Number(meta.messageId);
      if (!messageId) continue;

      const skipDecision = evaluateTelegramImportSkip(meta, importFilter);
      if (skipDecision.skip) {
        if (skipDecision.persistSkip) persistSkippedIds.push(messageId);
        skipped.push({
          messageId,
          fileName: meta.fileName,
          reason: skipDecision.reason || "Skipped",
        });
        continue;
      }

      maxMessageId = Math.max(maxMessageId, messageId);

      const existing = await Content.findOne({
        subjectId: subject._id,
        telegramChannelId: String(channelId),
        telegramMessageId: messageId,
      });
      if (existing) {
        skipped.push({ messageId, fileName: meta.fileName, reason: "Already imported" });
        continue;
      }

      const title = resolveTelegramMediaTitle(meta) || `Lesson ${messageId}`;

      if (uploadId) {
        const pct =
          mediaTotal > 0 ? Math.min(99, Math.round((mediaIndex / mediaTotal) * 100)) : 5;
        setProgress(uploadId, {
          phase: "syncing",
          message: `Importing — ${topic.title}`,
          currentFile: meta.displayName || meta.fileName,
          fileIndex: mediaIndex + 1,
          filesTotal: mediaTotal,
          percent: pct,
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
        importSortOrder: topicSortOrder++,
      });

      const doc = await Content.create(payload);

      created.push({
        ...doc.toObject(),
        subjectName: subject.name,
        topicTitle: topic.title,
      });
      registerImportedTitleKeys(importFilter, meta);
    }

    if (persistSkippedIds.length) {
      await appendSkippedMessageIds(subject._id, persistSkippedIds);
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
    channelMode: "forum",
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
  topicMediaPrefs = null,
  channelMode = "forum",
}) => {
  if (!Array.isArray(selectedItems) || !selectedItems.length) {
    throw new Error("No files selected for import.");
  }

  const topicMediaPrefsMap = normalizeTopicMediaPrefs(topicMediaPrefs);
  const topics = await fetchForumTopicsForChannel(channelId).catch(() => []);
  const topicById = new Map(topics.map((t) => [Number(t.id), t]));
  const prefsPersistedForTopic = new Set();

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
        preferredTitle: String(item.displayName || item.title || "").trim() || null,
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

    const subject = await getOrCreateSubjectForTopic({
      programmeId,
      channelId,
      topicId,
      topicTitle: meta.topicTitle,
      allowBlockedRecreate: true,
    });
    if (!subject) {
      skipped.push({ messageId, fileName: meta.fileName, reason: "Subject blocked or unavailable" });
      continue;
    }

    const prefs = resolveTopicMediaPrefs(topicId, topicMediaPrefsMap, subject);
    if (!prefsPersistedForTopic.has(topicId)) {
      await persistSubjectMediaPrefs(subject, prefs);
      prefsPersistedForTopic.add(topicId);
    }

    const existing = await Content.findOne({
      subjectId: subject._id,
      telegramChannelId: String(channelId),
      telegramMessageId: messageId,
    });
    if (existing) {
      skipped.push({ messageId, fileName: meta.fileName, reason: "Already imported" });
      continue;
    }

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
    channelMode: channelMode === "flat" ? "flat" : "forum",
  });

  if (uploadId) {
    completeProgress(uploadId, {
      message: `Imported ${created.length} selected file(s)`,
      filesTotal: metas.length,
      fileIndex: metas.length,
    });
  }

  const selectedIdsByTopic = new Map();
  for (const item of selectedItems) {
    const topicId = Number(item.topicId);
    const messageId = Number(item.messageId);
    if (!topicId || !messageId) continue;
    if (!selectedIdsByTopic.has(topicId)) selectedIdsByTopic.set(topicId, new Set());
    selectedIdsByTopic.get(topicId).add(messageId);
  }

  for (const [topicId, selectedSet] of selectedIdsByTopic) {
    const subject = await Subject.findOne({
      programmeId,
      telegramChannelId: String(channelId),
      telegramTopicId: Number(topicId),
    });
    if (!subject) continue;

    let mediaItems = [];
    try {
      mediaItems = await fetchMediaInTopic({ channelId, topicId: Number(topicId) });
    } catch {
      continue;
    }

    const skippedIds = mediaItems
      .map((row) => Number(row.messageId))
      .filter((messageId) => messageId && !selectedSet.has(messageId));
    if (skippedIds.length) {
      await appendSkippedMessageIds(subject._id, skippedIds);
    }
  }

  return {
    created,
    skipped,
    maxMessageId,
    topicsProcessed: new Set(metas.map((m) => m.topicId)).size,
    mapping,
  };
};

/** Match a batch subject to its Telegram topic within the same channel only. */
export const findPreviewTopicForSubject = (sub, { mapping, preview, topicById }) => {
  const channelId = String(mapping.channelId);
  const blockedTopics = new Set((mapping.blockedTopicIds || []).map(Number));
  const blockedKeys = new Set(mapping.blockedSubjectKeys || []);

  if (!sub.telegramChannelId || String(sub.telegramChannelId) !== channelId) {
    return null;
  }

  let topicId = Number(sub.telegramTopicId);

  if (preview.channelMode === "forum" && isVirtualFlatTopicId(topicId)) {
    topicId = NaN;
  }

  if (Number.isFinite(topicId) && topicId > 0) {
    if (blockedTopics.has(topicId)) return null;
    if (topicById.has(topicId)) return topicById.get(topicId);
  }

  if (sub.telegramSubjectKey && preview.channelMode === "flat") {
    const key = String(sub.telegramSubjectKey).trim();
    if (!key || blockedKeys.has(key)) return null;
    return (
      preview.topics.find(
        (t) =>
          t.subjectKey === key ||
          t.title.trim().toLowerCase() === key.toLowerCase()
      ) || null
    );
  }

  if (preview.channelMode === "forum") {
    const byName = preview.topics.find(
      (t) => t.title.trim().toLowerCase() === sub.name.trim().toLowerCase()
    );
    if (byName) {
      const id = Number(byName.id);
      if (blockedTopics.has(id)) return null;
      return byName;
    }
  }

  return null;
};

/** Fix subjects that store a flat-channel virtual topic id on a forum channel link. */
export const repairSubjectTelegramLinks = async ({ programmeId }) => {
  const mappings = await TelegramChannelMapping.find({ programmeId });
  if (!mappings.length) return { repaired: 0 };

  const mappingByChannel = new Map(mappings.map((row) => [String(row.channelId), row]));
  const subjects = await Subject.find({
    programmeId,
    telegramChannelId: { $ne: null },
    telegramTopicId: { $ne: null },
  });

  let repaired = 0;
  const previewCache = new Map();

  for (const subject of subjects) {
    const channelId = String(subject.telegramChannelId);
    const mapping = mappingByChannel.get(channelId);
    if (!mapping) continue;

    if (!previewCache.has(channelId)) {
      previewCache.set(channelId, await fetchForumTopicsPreview({ channelId }));
    }
    const preview = previewCache.get(channelId);
    if (preview.channelMode !== "forum") continue;

    const topicId = Number(subject.telegramTopicId);
    const topicById = new Map(preview.topics.map((t) => [Number(t.id), t]));
    if (!isVirtualFlatTopicId(topicId) && topicById.has(topicId)) continue;

    const match = preview.topics.find(
      (t) => t.title.trim().toLowerCase() === subject.name.trim().toLowerCase()
    );
    if (!match) continue;

    subject.telegramTopicId = Number(match.id);
    subject.telegramSubjectKey = null;
    await subject.save();
    repaired += 1;
  }

  return { repaired };
};

/** Check which programme subjects have new Telegram media not yet imported. */
export const getProgrammeSubjectUpdates = async ({ programmeId }) => {
  await reconcileBlockedTopicsForProgramme(programmeId);

  const mappings = await TelegramChannelMapping.find({ programmeId });
  if (!mappings.length) {
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
      channelId: mappings[0]?.channelId || null,
      subjects: [],
      totalNew: 0,
      subjectsWithUpdates: 0,
    };
  }

  const batchSubjects = await Subject.find({
    programmeId,
    telegramChannelId: { $ne: null },
    $or: [{ telegramTopicId: { $ne: null } }, { telegramSubjectKey: { $ne: null } }],
  }).select(
    "_id name telegramTopicId telegramSubjectKey telegramChannelId programmeId telegramImportVideos telegramImportPdfs telegramSkippedMessageIds"
  );

  if (!batchSubjects.length) {
    return {
      available: false,
      reason: "No Telegram-linked subjects in this batch.",
      channelId: mappings[0]?.channelId || null,
      subjects: [],
      totalNew: 0,
      subjectsWithUpdates: 0,
    };
  }

  const mappingByChannel = new Map(mappings.map((row) => [String(row.channelId), row]));
  const programmeSubjectIds = batchSubjects.map((sub) => sub._id);
  const titleKeysBySubjectId = buildTitleKeysBySubjectId(
    await Content.find({ subjectId: { $in: programmeSubjectIds } })
      .select("subjectId title")
      .lean()
  );

  const subjectsByChannel = new Map();
  for (const sub of batchSubjects) {
    const channelId = String(sub.telegramChannelId);
    if (!subjectsByChannel.has(channelId)) subjectsByChannel.set(channelId, []);
    subjectsByChannel.get(channelId).push(sub);
  }

  const subjects = [];

  for (const [channelId, channelSubjects] of subjectsByChannel) {
    const mapping = mappingByChannel.get(channelId);
    if (!mapping) {
      for (const sub of channelSubjects) {
        subjects.push({
          subjectId: String(sub._id),
          subjectName: sub.name,
          topicId: Number(sub.telegramTopicId) || null,
          newCount: 0,
          hasUpdate: false,
          newVideos: 0,
          newPdfs: 0,
          topicTitle: sub.name,
          linkedToChannel: false,
        });
      }
      continue;
    }

    // Newest imported message id for this batch on this channel.
    const programmeSubjectIds = channelSubjects.map((sub) => sub._id);
    const newestImported = await Content.findOne({
      telegramChannelId: channelId,
      subjectId: { $in: programmeSubjectIds },
    })
      .sort({ telegramMessageId: -1 })
      .select("telegramMessageId")
      .lean();
    const minId = Number(newestImported?.telegramMessageId || 0);

    let newMedia = [];
    try {
      newMedia = await fetchNewChannelMediaSince({ channelId, minId });
    } catch {
      newMedia = [];
    }

    // Safety: drop anything already imported (e.g. older gaps re-surfaced).
    if (newMedia.length) {
      const candidateIds = newMedia.map((m) => Number(m.messageId));
      const importedRows = await Content.find({
        telegramChannelId: channelId,
        telegramMessageId: { $in: candidateIds },
        subjectId: { $in: programmeSubjectIds },
      })
        .select("telegramMessageId")
        .lean();
      const importedSet = new Set(importedRows.map((r) => Number(r.telegramMessageId)));
      newMedia = newMedia.filter((m) => !importedSet.has(Number(m.messageId)));
    }

    const isFlatChannel = mapping.channelMode === "flat";
    const subjectByTopicId = new Map(
      channelSubjects
        .filter((sub) => sub.telegramTopicId != null)
        .map((sub) => [Number(sub.telegramTopicId), sub])
    );
    const subjectByKey = new Map(
      channelSubjects
        .filter((sub) => sub.telegramSubjectKey)
        .map((sub) => [sub.telegramSubjectKey, sub])
    );
    const filterBySubjectId = new Map(
      channelSubjects.map((sub) => [
        String(sub._id),
        createSubjectImportFilter(sub, titleKeysBySubjectId),
      ])
    );

    // Bucket new media by topic (forum) or inferred subject key (flat).
    const countsByTopic = new Map();
    const countsByKey = new Map();
    const duplicateSkipsToPersist = new Map();
    const bump = (bucket, mapRef, mediaType) => {
      const row = mapRef.get(bucket) || { total: 0, video: 0, pdf: 0 };
      row.total += 1;
      if (mediaType === "video") row.video += 1;
      else row.pdf += 1;
      mapRef.set(bucket, row);
    };

    for (const media of newMedia) {
      let subject = null;
      if (isFlatChannel) {
        const key = inferFlatChannelSubjectKey(media);
        subject = key ? subjectByKey.get(key) : null;
      } else {
        const tid = Number(media.topicId) || 0;
        subject = tid ? subjectByTopicId.get(tid) : null;
      }
      if (!subject) continue;

      const filter = filterBySubjectId.get(String(subject._id));
      const skipDecision = filter ? evaluateTelegramImportSkip(media, filter) : { skip: true };
      if (skipDecision.skip) {
        if (skipDecision.persistSkip) {
          const sid = String(subject._id);
          if (!duplicateSkipsToPersist.has(sid)) duplicateSkipsToPersist.set(sid, []);
          duplicateSkipsToPersist.get(sid).push(Number(media.messageId));
        }
        continue;
      }

      if (isFlatChannel) {
        const key = inferFlatChannelSubjectKey(media);
        if (key) bump(key, countsByKey, media.mediaType);
      } else {
        const tid = Number(media.topicId) || 0;
        if (tid) bump(tid, countsByTopic, media.mediaType);
      }
    }

    for (const [subjectId, messageIds] of duplicateSkipsToPersist) {
      await appendSkippedMessageIds(subjectId, messageIds);
    }

    for (const sub of channelSubjects) {
      let counts = { total: 0, video: 0, pdf: 0 };
      let topicId = Number(sub.telegramTopicId) || null;

      if (isFlatChannel && sub.telegramSubjectKey) {
        counts = countsByKey.get(sub.telegramSubjectKey) || counts;
        topicId = subjectKeyToVirtualTopicId(sub.telegramSubjectKey);
      } else if (!isFlatChannel && sub.telegramTopicId) {
        counts = countsByTopic.get(Number(sub.telegramTopicId)) || counts;
      }

      subjects.push({
        subjectId: String(sub._id),
        subjectName: sub.name,
        topicId,
        newCount: counts.total,
        hasUpdate: counts.total > 0,
        newVideos: counts.video,
        newPdfs: counts.pdf,
        topicTitle: sub.name,
        linkedToChannel: true,
        channelId,
      });
    }
  }

  const totalNew = subjects.reduce((sum, s) => sum + s.newCount, 0);
  const subjectsWithUpdates = subjects.filter((s) => s.hasUpdate).length;
  const primaryMapping = mappings.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];

  return {
    available: true,
    channelId: primaryMapping?.channelId || null,
    channelTitle: primaryMapping?.channelTitle || "",
    channelMode: primaryMapping?.channelMode || "forum",
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
  uploadId = null,
}) => {
  const session = await getActiveSession();
  if (!session?.isActive) {
    throw new Error("Telegram is not connected. Connect in Add from Telegram.");
  }

  if (uploadId) {
    initProgress(uploadId, {
      phase: "syncing",
      percent: 3,
      message: "Checking which subjects have new lessons…",
    });
  }

  try {
    await repairSubjectTelegramLinks({ programmeId });
    throwIfCancelled(uploadId);
    const status = await getProgrammeSubjectUpdates({ programmeId });
    if (!status.available) {
      throw new Error(status.reason || "Cannot check for updates.");
    }

    let topicIds = [];
    let channelId = null;
    let channelTitle = "";

    if (allWithUpdates) {
      const withUpdates = status.subjects.filter((s) => s.hasUpdate);
      topicIds = withUpdates.map((s) => s.topicId).filter(Boolean);
      channelId = withUpdates[0]?.channelId || status.channelId;
      if (!topicIds.length) {
        if (uploadId) {
          completeProgress(uploadId, { message: "All subjects are up to date." });
        }
        return { created: [], skipped: [], imported: 0, message: "All subjects are up to date." };
      }
    } else {
      const ids = subjectIds?.length ? subjectIds : subjectId ? [subjectId] : [];
      if (!ids.length) {
        throw new Error("subjectId or subjectIds is required.");
      }

      const selected = status.subjects.filter((row) => ids.map(String).includes(String(row.subjectId)));
      if (!selected.length) {
        throw new Error("Subject is not linked to a Telegram topic. Re-add it from Telegram.");
      }

      const withUpdates = selected.filter((row) => row.hasUpdate);
      if (!withUpdates.length) {
        if (uploadId) {
          completeProgress(uploadId, { message: "Already up to date." });
        }
        return {
          created: [],
          skipped: [],
          imported: 0,
          message: "Already up to date.",
        };
      }

      topicIds = withUpdates.map((s) => s.topicId).filter(Boolean);
      channelId = withUpdates[0]?.channelId;
    }

    if (!channelId) {
      throw new Error("No Telegram channel linked to this batch. Import from Telegram first.");
    }

    let mapping = await TelegramChannelMapping.findOne({
      programmeId,
      channelId: String(channelId),
    });
    channelTitle = mapping?.channelTitle || "";

    let isFlatChannel = mapping?.channelMode === "flat";
    if (!isFlatChannel && mapping?.channelMode !== "forum") {
      try {
        isFlatChannel = !(await fetchForumTopicsForChannel(channelId)).length;
      } catch {
        isFlatChannel = true;
      }
    }

    if (uploadId) {
      setProgress(uploadId, {
        phase: "syncing",
        percent: 8,
        message: `Downloading new lessons for ${topicIds.length} subject(s)…`,
      });
    }

    if (isFlatChannel) {
      const { importBatchByFlatSubjects } = await import("./telegramFlatChannelService.js");
      const result = await importBatchByFlatSubjects({
        channelId,
        channelTitle,
        programmeId,
        autoSync: mapping?.autoSync ?? true,
        topicIds,
        existingSubjectsOnly: true,
        uploadId,
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
    }

    const result = await importBatchByForumTopics({
      channelId,
      channelTitle,
      programmeId,
      autoSync: mapping?.autoSync ?? true,
      cleanSync: false,
      topicIds,
      existingSubjectsOnly: true,
      uploadId,
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
  } catch (error) {
    if (uploadId && error?.code !== "CANCELLED") {
      failProgress(uploadId, error.message || "Update failed");
    }
    throw error;
  }
};
