import Content from "../models/Content.js";
import Subject from "../models/Subject.js";
import {
  inferFlatChannelSubjectKey,
  resolveFlatChannelLessonTitle,
  subjectKeyToVirtualTopicId,
} from "../utils/telegramFlatChannel.js";
import { getOrCreateChapterForSubject } from "../utils/chapterHelpers.js";
import {
  buildTelegramContentPayload,
  upsertChannelMapping,
} from "./telegramMappingService.js";
import { fetchAllChannelMediaEnriched } from "./telegramService.js";
import { completeProgress, initProgress, setProgress, throwIfCancelled } from "./uploadProgressBus.js";
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
  findImportedContentRowsForProgramme,
  getProgrammeTelegramScope,
  topicInProgrammeCourse,
} from "../utils/telegramProgrammeScope.js";
import {
  isSubjectKeyBlocked,
  unblockTelegramSubjectsForImport,
} from "./telegramSubjectBlocklist.js";

const LESSONS_CHAPTER = "Lessons";

export const groupFlatChannelMediaBySubject = (mediaItems = []) => {
  const groups = new Map();
  for (const meta of mediaItems) {
    const subjectKey = inferFlatChannelSubjectKey(meta);
    if (!groups.has(subjectKey)) {
      groups.set(subjectKey, {
        subjectKey,
        id: subjectKeyToVirtualTopicId(subjectKey),
        title: subjectKey,
        media: [],
      });
    }
    groups.get(subjectKey).media.push(meta);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
};

export const fetchFlatChannelSubjectsPreview = async ({
  channelId,
  programmeId = null,
  maxMessages = 3000,
}) => {
  const media = await fetchAllChannelMediaEnriched({ channelId, maxMessages });
  const topics = groupFlatChannelMediaBySubject(media);

  const messageIds = media.map((m) => m.messageId);
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
      }).select("_id telegramMessageId");

  const importedSet = new Set(importedRows.map((r) => Number(r.telegramMessageId)));

  const enriched = topics.map((topic) => {
    const importedCount = topic.media.filter((m) => importedSet.has(Number(m.messageId))).length;
    const videoCount = topic.media.filter((m) => m.mediaType === "video").length;
    const pdfCount = topic.media.filter((m) => m.mediaType === "pdf").length;
    const inCourse =
      programmeId && scope
        ? topicInProgrammeCourse(scope, topic) || importedCount > 0
        : importedCount > 0;
    return {
      id: topic.id,
      title: topic.title,
      subjectKey: topic.subjectKey,
      mediaCount: topic.media.length,
      videoCount,
      pdfCount,
      importedCount,
      inCourse,
      newCount: topic.media.filter((m) => !importedSet.has(Number(m.messageId))).length,
      media: topic.media
        .map((item) => ({
          ...item,
          imported: importedSet.has(Number(item.messageId)),
          contentId:
            importedRows.find((r) => Number(r.telegramMessageId) === Number(item.messageId))?._id ||
            null,
        }))
        .sort((a, b) => a.messageId - b.messageId),
    };
  });

  const totalMedia = media.length;
  const totalImported = importedRows.length;

  return {
    isForum: false,
    channelMode: "flat",
    topics: enriched,
    totalMedia,
    totalImported,
    totalNew: totalMedia - totalImported,
  };
};

/** Faster flat-channel subject list (scan enough history to catch videos + PDFs). */
export const fetchFlatChannelSubjectsPreviewSummary = async ({ channelId, programmeId = null }) => {
  const result = await fetchFlatChannelSubjectsPreview({ channelId, programmeId, maxMessages: 3000 });
  return {
    ...result,
    summaryOnly: true,
    totalNew: 0,
    topics: result.topics.map((topic) => ({
      ...topic,
      videoCount: topic.videoCount ?? topic.media.filter((m) => m.mediaType === "video").length,
      pdfCount: topic.pdfCount ?? topic.media.filter((m) => m.mediaType === "pdf").length,
      media: [],
      mediaLoaded: false,
    })),
  };
};

export const fetchFlatChannelTopicMediaPreview = async ({ channelId, topicId, programmeId = null }) => {
  const preview = await fetchFlatChannelSubjectsPreview({ channelId, programmeId, maxMessages: 3000 });
  const topic = preview.topics.find((row) => Number(row.id) === Number(topicId));
  if (!topic) {
    throw new Error("Subject not found in this channel.");
  }
  return {
    id: topic.id,
    media: topic.media,
    mediaCount: topic.mediaCount,
    importedCount: topic.importedCount,
    inCourse: topic.inCourse,
    newCount: topic.newCount,
    mediaLoaded: true,
  };
};

export const getOrCreateSubjectForFlatChannel = async ({
  programmeId,
  channelId,
  subjectKey,
  allowBlockedRecreate = false,
}) => {
  const key = String(subjectKey || "").trim();
  const name = key || "General";
  const virtualTopicId = subjectKeyToVirtualTopicId(key);
  if (!key) throw new Error("Subject key is empty");

  const blocked = await isSubjectKeyBlocked({ programmeId, subjectKey: key });
  if (blocked && !allowBlockedRecreate) return null;
  if (blocked && allowBlockedRecreate) {
    await unblockTelegramSubjectsForImport({ programmeId, subjectKeys: [key] });
  }

  let subject = await Subject.findOne({
    programmeId,
    telegramChannelId: String(channelId),
    telegramSubjectKey: key,
  });
  if (subject) {
    let changed = false;
    if (subject.name !== name) {
      subject.name = name;
      changed = true;
    }
    if (subject.telegramTopicId !== virtualTopicId) {
      subject.telegramTopicId = virtualTopicId;
      changed = true;
    }
    if (changed) await subject.save();
    return subject;
  }

  const byName = await Subject.findOne({ programmeId, name });
  if (byName && !byName.telegramSubjectKey) {
    if (byName.telegramChannelId && String(byName.telegramChannelId) !== String(channelId)) {
      return null;
    }
    byName.telegramChannelId = String(channelId);
    byName.telegramSubjectKey = key;
    byName.telegramTopicId = virtualTopicId;
    await byName.save();
    return byName;
  }

  try {
    return await Subject.create({
      programmeId,
      name,
      telegramChannelId: String(channelId),
      telegramSubjectKey: key,
      telegramTopicId: virtualTopicId,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return (
        (await Subject.findOne({ programmeId, telegramSubjectKey: key })) ||
        (await Subject.findOne({ programmeId, name }))
      );
    }
    throw err;
  }
};

export const importBatchByFlatSubjects = async ({
  channelId,
  channelTitle,
  programmeId,
  topicIds = null,
  autoSync = true,
  uploadId = null,
  existingSubjectsOnly = false,
  allowBlockedRecreate = false,
  topicMediaPrefs = null,
}) => {
  const topicMediaPrefsMap = normalizeTopicMediaPrefs(topicMediaPrefs);
  if (allowBlockedRecreate && Array.isArray(topicIds) && topicIds.length) {
    await unblockTelegramSubjectsForImport({ programmeId, topicIds });
  }

  const preview = await fetchFlatChannelSubjectsPreview({ channelId });
  let topics = preview.topics;
  if (Array.isArray(topicIds) && topicIds.length) {
    const allowed = new Set(topicIds.map(Number));
    topics = topics.filter((t) => allowed.has(Number(t.id)));
  }

  if (!topics.length) {
    throw new Error(
      Array.isArray(topicIds) && topicIds.length
        ? "Selected subjects were not found. Refresh the page and try again."
        : "No subjects detected in this channel. Messages need Topic: or Batch: in the caption."
    );
  }

  const created = [];
  const skipped = [];
  let maxMessageId = 0;

  const mediaTotal = topics.reduce((sum, topic) => {
    const prefs = resolveTopicMediaPrefs(topic.id, topicMediaPrefsMap);
    return sum + topic.media.filter((m) => shouldImportTelegramMedia(m, prefs)).length;
  }, 0);

  if (uploadId) {
    initProgress(uploadId, {
      phase: "pending",
      message: "Preparing flat-channel import…",
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
        telegramSubjectKey: topic.subjectKey,
      });
      if (!subject) continue;
    } else {
      subject = await getOrCreateSubjectForFlatChannel({
        programmeId,
        channelId,
        subjectKey: topic.subjectKey,
        allowBlockedRecreate,
      });
      if (!subject) continue;
    }
    const chapter = await getOrCreateChapterForSubject(subject._id, LESSONS_CHAPTER);
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
    for (const meta of topic.media) {
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

      const title = resolveFlatChannelLessonTitle(meta) || `Lesson ${messageId}`;

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
        topicId: null,
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

  const isPartialImport = Array.isArray(topicIds) && topicIds.length > 0;
  const mapping = await upsertChannelMapping({
    channelId,
    channelTitle,
    programmeId,
    autoSync,
    lastSyncedMessageId: maxMessageId,
    importedCount: created.length,
    syncTopicIds: topics.map((t) => t.id),
    replaceSyncTopicIds: !isPartialImport,
    channelMode: "flat",
    syncSubjectKeys: topics.map((t) => t.subjectKey),
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
    mode: "flat_subjects",
  };
};
