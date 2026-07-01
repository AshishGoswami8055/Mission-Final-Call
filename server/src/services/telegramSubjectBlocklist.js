import TelegramChannelMapping from "../models/TelegramChannelMapping.js";

export const getMappingForProgramme = (programmeId) =>
  TelegramChannelMapping.findOne({ programmeId }).sort({ updatedAt: -1 });

export const isTopicBlocked = async ({ programmeId, topicId }) => {
  if (topicId == null || !programmeId) return false;
  const mapping = await getMappingForProgramme(programmeId);
  if (!mapping?.blockedTopicIds?.length) return false;
  return mapping.blockedTopicIds.map(Number).includes(Number(topicId));
};

export const isSubjectKeyBlocked = async ({ programmeId, subjectKey }) => {
  const key = String(subjectKey || "").trim();
  if (!key || !programmeId) return false;
  const mapping = await getMappingForProgramme(programmeId);
  if (!mapping?.blockedSubjectKeys?.length) return false;
  return mapping.blockedSubjectKeys.includes(key);
};

/** Remember a user-deleted Telegram subject so background sync cannot recreate it. */
export const blockSubjectFromTelegramSync = async (subject) => {
  if (!subject?.programmeId) return;

  const pull = {};
  const addToSet = {};

  if (subject.telegramTopicId != null) {
    pull.syncTopicIds = Number(subject.telegramTopicId);
    addToSet.blockedTopicIds = Number(subject.telegramTopicId);
  }
  if (subject.telegramSubjectKey) {
    const key = String(subject.telegramSubjectKey);
    pull.syncSubjectKeys = key;
    addToSet.blockedSubjectKeys = key;
  }
  if (!Object.keys(pull).length && !Object.keys(addToSet).length) return;

  const update = {};
  if (Object.keys(pull).length) update.$pull = pull;
  if (Object.keys(addToSet).length) update.$addToSet = addToSet;

  await TelegramChannelMapping.updateMany({ programmeId: subject.programmeId }, update);
};

/** Allow re-import when the user explicitly adds subjects from Telegram again. */
export const unblockTelegramSubjectsForImport = async ({
  programmeId,
  topicIds = [],
  subjectKeys = [],
}) => {
  if (!programmeId) return;

  const update = {};
  const topicNums = [...new Set(topicIds.map(Number).filter(Boolean))];
  const keys = [...new Set(subjectKeys.map(String).filter(Boolean))];

  if (topicNums.length) {
    update.$pullAll = { ...(update.$pullAll || {}), blockedTopicIds: topicNums };
  }
  if (keys.length) {
    update.$pullAll = { ...(update.$pullAll || {}), blockedSubjectKeys: keys };
  }
  if (!Object.keys(update).length) return;

  await TelegramChannelMapping.updateMany({ programmeId }, update);
};

export const filterTopicIdsForSyncWrite = async ({ programmeId, topicIds = [] }) => {
  const normalized = [...new Set(topicIds.map(Number).filter(Boolean))];
  if (!normalized.length || !programmeId) return normalized;

  const mapping = await getMappingForProgramme(programmeId);
  const blocked = new Set((mapping?.blockedTopicIds || []).map(Number));
  return normalized.filter((id) => !blocked.has(id));
};

export const filterSubjectKeysForSyncWrite = async ({ programmeId, subjectKeys = [] }) => {
  const normalized = [...new Set(subjectKeys.map(String).filter(Boolean))];
  if (!normalized.length || !programmeId) return normalized;

  const mapping = await getMappingForProgramme(programmeId);
  const blocked = new Set(mapping?.blockedSubjectKeys || []);
  return normalized.filter((key) => !blocked.has(key));
};

/** Unblock topics/keys that still have an active subject in the batch. */
export const reconcileBlockedTopicsForProgramme = async (programmeId) => {
  if (!programmeId) return { unblockedTopics: 0 };

  const Subject = (await import("../models/Subject.js")).default;
  const subjects = await Subject.find({
    programmeId,
    telegramChannelId: { $ne: null },
    $or: [{ telegramTopicId: { $ne: null } }, { telegramSubjectKey: { $ne: null } }],
  }).select("telegramTopicId telegramSubjectKey telegramChannelId");

  const mappings = await TelegramChannelMapping.find({ programmeId });
  let unblockedTopics = 0;

  for (const mapping of mappings) {
    const channelId = String(mapping.channelId);
    const activeTopicIds = [
      ...new Set(
        subjects
          .filter((row) => String(row.telegramChannelId) === channelId)
          .map((row) => Number(row.telegramTopicId))
          .filter(Boolean)
      ),
    ];
    const activeKeys = [
      ...new Set(
        subjects
          .filter((row) => String(row.telegramChannelId) === channelId)
          .map((row) => String(row.telegramSubjectKey || ""))
          .filter(Boolean)
      ),
    ];

    const blockedBefore = new Set((mapping.blockedTopicIds || []).map(Number));
    const toUnblockTopics = activeTopicIds.filter((id) => blockedBefore.has(id));
    if (!toUnblockTopics.length && !activeKeys.length) continue;

    await TelegramChannelMapping.updateOne(
      { _id: mapping._id },
      {
        $pull: {
          ...(toUnblockTopics.length ? { blockedTopicIds: { $in: toUnblockTopics } } : {}),
          ...(activeKeys.length ? { blockedSubjectKeys: { $in: activeKeys } } : {}),
        },
      }
    );
    unblockedTopics += toUnblockTopics.length;
  }

  return { unblockedTopics };
};
