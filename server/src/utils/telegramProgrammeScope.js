import Content from "../models/Content.js";
import Subject from "../models/Subject.js";

/** Subjects in a batch that are linked to a Telegram channel. */
export const getProgrammeTelegramSubjects = async (programmeId, channelId) => {
  if (!programmeId || !channelId) return [];
  return Subject.find({
    programmeId,
    telegramChannelId: String(channelId),
  }).select("_id name telegramTopicId telegramSubjectKey telegramImportVideos telegramImportPdfs telegramSkippedMessageIds");
};

export const getProgrammeTelegramScope = async (programmeId, channelId) => {
  const subjects = await getProgrammeTelegramSubjects(programmeId, channelId);
  const subjectIds = subjects.map((row) => row._id);
  const topicIdsInCourse = new Set(
    subjects.filter((row) => row.telegramTopicId != null).map((row) => Number(row.telegramTopicId))
  );
  const subjectKeysInCourse = new Set(
    subjects.filter((row) => row.telegramSubjectKey).map((row) => row.telegramSubjectKey)
  );
  const subjectByTopicId = new Map(
    subjects
      .filter((row) => row.telegramTopicId != null)
      .map((row) => [Number(row.telegramTopicId), row])
  );
  const subjectByKey = new Map(
    subjects.filter((row) => row.telegramSubjectKey).map((row) => [row.telegramSubjectKey, row])
  );

  return {
    subjects,
    subjectIds,
    topicIdsInCourse,
    subjectKeysInCourse,
    subjectByTopicId,
    subjectByKey,
  };
};

export const findImportedContentRowsForProgramme = async ({
  programmeId,
  channelId,
  messageIds = null,
  subjectIds = null,
  requireTopicId = false,
}) => {
  const channelKey = String(channelId);
  const query = { telegramChannelId: channelKey };

  if (Array.isArray(messageIds) && messageIds.length) {
    query.telegramMessageId = { $in: messageIds.map(Number) };
  }
  if (requireTopicId) {
    query.telegramTopicId = { $ne: null };
  }

  if (programmeId) {
    let scopedSubjectIds = subjectIds;
    if (!scopedSubjectIds) {
      const scope = await getProgrammeTelegramScope(programmeId, channelId);
      scopedSubjectIds = scope.subjectIds;
    }
    if (!scopedSubjectIds?.length) return [];
    query.subjectId = { $in: scopedSubjectIds };
  }

  return Content.find(query).select("_id telegramMessageId telegramTopicId subjectId");
};

export const findExistingTelegramContentInProgramme = async ({
  programmeId,
  channelId,
  messageId,
  topicId = null,
  subjectIds = null,
}) => {
  if (!programmeId) return null;

  let scopedSubjectIds = subjectIds;
  if (!scopedSubjectIds) {
    const scope = await getProgrammeTelegramScope(programmeId, channelId);
    scopedSubjectIds = scope.subjectIds;
  }
  if (!scopedSubjectIds?.length) return null;

  const query = {
    telegramChannelId: String(channelId),
    telegramMessageId: Number(messageId),
    subjectId: { $in: scopedSubjectIds },
  };
  if (topicId != null) {
    query.telegramTopicId = Number(topicId);
  }
  return Content.findOne(query);
};

export const topicInProgrammeCourse = (scope, topic) => {
  if (!scope) return false;
  if (topic?.subjectKey && scope.subjectKeysInCourse.has(topic.subjectKey)) return true;
  return scope.topicIdsInCourse.has(Number(topic.id));
};
