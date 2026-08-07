import Subject from "../models/Subject.js";
import { resolveTelegramMediaTitle } from "../services/telegramService.js";
import {
  resolveTopicMediaPrefs,
  shouldImportTelegramMedia,
} from "./telegramImportMediaPrefs.js";

/** Normalize lesson titles / file names for duplicate comparison. */
export const normalizeLessonTitleKey = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/\.(mp4|mkv|webm|mov|m4v|pdf)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const titleKeyFromTelegramMeta = (meta) => {
  const title =
    resolveTelegramMediaTitle(meta) ||
    String(meta?.displayName || meta?.fileName || "").trim();
  return normalizeLessonTitleKey(title);
};

/** Title + file-name keys so duplicates are caught even when captions differ. */
export const duplicateKeysFromTelegramMeta = (meta) => {
  const keys = new Set();
  const titleKey = titleKeyFromTelegramMeta(meta);
  if (titleKey) keys.add(titleKey);
  const fileKey = normalizeLessonTitleKey(meta?.fileName || "");
  if (fileKey) keys.add(fileKey);
  return keys;
};

export const isDuplicateTelegramMedia = (meta, titleKeys) => {
  if (!titleKeys?.size) return false;
  for (const key of duplicateKeysFromTelegramMeta(meta)) {
    if (titleKeys.has(key)) return true;
  }
  return false;
};

export const buildTitleKeysBySubjectId = (contentRows = []) => {
  const map = new Map();
  for (const row of contentRows) {
    const subjectId = String(row.subjectId);
    if (!map.has(subjectId)) map.set(subjectId, new Set());
    const key = normalizeLessonTitleKey(row.title);
    if (key) map.get(subjectId).add(key);
  }
  return map;
};

export const createSubjectImportFilter = (subject, titleKeysBySubjectId, topicMediaPrefsMap = null) => {
  const topicId = Number(subject.telegramTopicId) || null;
  const prefs = resolveTopicMediaPrefs(topicId, topicMediaPrefsMap, subject);
  return {
    prefs,
    skippedSet: new Set((subject.telegramSkippedMessageIds || []).map(Number)),
    titleKeys: titleKeysBySubjectId.get(String(subject._id)) || new Set(),
  };
};

/**
 * Decide whether a Telegram file should be treated as actionable "new" content.
 * Skipped / duplicate items are not counted and are not imported on update.
 */
export const evaluateTelegramImportSkip = (meta, filter) => {
  if (!shouldImportTelegramMedia(meta, filter.prefs)) {
    return { skip: true, reason: "Type filtered", persistSkip: false };
  }

  const messageId = Number(meta.messageId);
  if (filter.skippedSet.has(messageId)) {
    return { skip: true, reason: "Skipped by user", persistSkip: false };
  }

  if (isDuplicateTelegramMedia(meta, filter.titleKeys)) {
    return { skip: true, reason: "Duplicate lesson", persistSkip: true };
  }

  return { skip: false, reason: null, persistSkip: false };
};

export const registerImportedTitleKeys = (filter, meta) => {
  for (const key of duplicateKeysFromTelegramMeta(meta)) {
    filter.titleKeys.add(key);
  }
};

export const appendSkippedMessageIds = async (subjectId, messageIds = []) => {
  const ids = [...new Set(messageIds.map(Number).filter(Boolean))];
  if (!ids.length || !subjectId) return;
  await Subject.updateOne(
    { _id: subjectId },
    { $addToSet: { telegramSkippedMessageIds: { $each: ids } } }
  );
};
