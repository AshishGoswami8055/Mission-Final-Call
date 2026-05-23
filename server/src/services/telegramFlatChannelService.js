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
import { completeProgress, initProgress, setProgress } from "./uploadProgressBus.js";

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

export const fetchFlatChannelSubjectsPreview = async ({ channelId, maxMessages = 3000 }) => {
  const media = await fetchAllChannelMediaEnriched({ channelId, maxMessages });
  const topics = groupFlatChannelMediaBySubject(media);

  const messageIds = media.map((m) => m.messageId);
  const importedRows = await Content.find({
    telegramChannelId: String(channelId),
    telegramMessageId: { $in: messageIds },
  }).select("_id telegramMessageId");

  const importedSet = new Set(importedRows.map((r) => Number(r.telegramMessageId)));

  const enriched = topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    subjectKey: topic.subjectKey,
    mediaCount: topic.media.length,
    importedCount: topic.media.filter((m) => importedSet.has(Number(m.messageId))).length,
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
  }));

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

export const getOrCreateSubjectForFlatChannel = async ({
  programmeId,
  channelId,
  subjectKey,
}) => {
  const key = String(subjectKey || "").trim();
  const name = key || "General";
  const virtualTopicId = subjectKeyToVirtualTopicId(key);
  if (!key) throw new Error("Subject key is empty");

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
}) => {
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

  const allMedia = topics.flatMap((t) => t.media);
  const mediaTotal = allMedia.filter(
    (m) => m.mediaType === "pdf" || m.mediaType === "video"
  ).length;

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
    const subject = await getOrCreateSubjectForFlatChannel({
      programmeId,
      channelId,
      subjectKey: topic.subjectKey,
    });
    const chapter = await getOrCreateChapterForSubject(subject._id, LESSONS_CHAPTER);

    for (const meta of topic.media) {
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

      const title = resolveFlatChannelLessonTitle(meta) || `Lesson ${messageId}`;

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
        topicId: null,
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
