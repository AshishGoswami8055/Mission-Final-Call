import Subject from "../models/Subject.js";

export const DEFAULT_TOPIC_MEDIA_PREFS = { includeVideos: true, includePdfs: true };

/** Parse `{ "123": { includeVideos, includePdfs } }` from API body into a Map. */
export const normalizeTopicMediaPrefs = (topicMediaPrefs) => {
  if (!topicMediaPrefs || typeof topicMediaPrefs !== "object") return null;
  const map = new Map();
  for (const [rawKey, rawVal] of Object.entries(topicMediaPrefs)) {
    const topicId = Number(rawKey);
    if (!Number.isFinite(topicId)) continue;
    map.set(topicId, {
      includeVideos: rawVal?.includeVideos !== false,
      includePdfs: rawVal?.includePdfs !== false,
    });
  }
  return map.size ? map : null;
};

export const resolveTopicMediaPrefs = (topicId, topicMediaPrefsMap, subject = null) => {
  const id = Number(topicId);
  if (topicMediaPrefsMap?.has(id)) {
    return topicMediaPrefsMap.get(id);
  }
  if (subject) {
    return {
      includeVideos: subject.telegramImportVideos !== false,
      includePdfs: subject.telegramImportPdfs !== false,
    };
  }
  return { ...DEFAULT_TOPIC_MEDIA_PREFS };
};

export const shouldImportTelegramMedia = (meta, prefs) => {
  if (meta.mediaType === "video") return prefs.includeVideos;
  if (meta.mediaType === "pdf") return prefs.includePdfs;
  return false;
};

export const persistSubjectMediaPrefs = async (subject, prefs) => {
  if (!subject?._id) return;
  const includeVideos = prefs.includeVideos !== false;
  const includePdfs = prefs.includePdfs !== false;
  if (
    subject.telegramImportVideos === includeVideos &&
    subject.telegramImportPdfs === includePdfs
  ) {
    return;
  }
  await Subject.updateOne(
    { _id: subject._id },
    { $set: { telegramImportVideos: includeVideos, telegramImportPdfs: includePdfs } }
  );
  subject.telegramImportVideos = includeVideos;
  subject.telegramImportPdfs = includePdfs;
};

export const enrichTopicsWithImportPrefs = async (topics, { programmeId, channelId }) => {
  if (!programmeId || !Array.isArray(topics) || !topics.length) return topics;

  const subjects = await Subject.find({
    programmeId,
    telegramChannelId: String(channelId),
  }).select("telegramTopicId telegramSubjectKey telegramImportVideos telegramImportPdfs");

  const byTopicId = new Map();
  const bySubjectKey = new Map();
  for (const row of subjects) {
    if (row.telegramTopicId != null) {
      byTopicId.set(Number(row.telegramTopicId), row);
    }
    if (row.telegramSubjectKey) {
      bySubjectKey.set(row.telegramSubjectKey, row);
    }
  }

  return topics.map((topic) => {
    const subject =
      byTopicId.get(Number(topic.id)) ||
      (topic.subjectKey ? bySubjectKey.get(topic.subjectKey) : null);
    return {
      ...topic,
      importVideos: subject?.telegramImportVideos !== false,
      importPdfs: subject?.telegramImportPdfs !== false,
    };
  });
};
