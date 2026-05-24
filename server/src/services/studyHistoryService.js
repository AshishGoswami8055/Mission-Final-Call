import StudySession from "../models/StudySession.js";
import ReadingSession from "../models/ReadingSession.js";
import MockTestResult from "../models/MockTestResult.js";
import DailyMission from "../models/DailyMission.js";
import { todayDateKey } from "../utils/subjectBuckets.js";

export const logStudySession = async ({
  userId,
  type,
  durationMinutes = 0,
  contentId = null,
  paperId = null,
  missionId = null,
  subjectId = null,
  subjectName = "",
  slot = null,
  meta = {},
}) => {
  const mins = Math.max(0, Math.round(Number(durationMinutes) || 0));
  return StudySession.create({
    userId,
    date: todayDateKey(),
    type,
    durationMinutes: mins,
    contentId,
    paperId,
    missionId,
    subjectId,
    subjectName,
    slot,
    startedAt: new Date(),
    endedAt: new Date(),
    meta,
  });
};

export const getRecentContentIds = async (userId, days = 3) => {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sessions = await StudySession.find({
    userId,
    type: "video",
    contentId: { $ne: null },
    createdAt: { $gte: since },
  })
    .select("contentId")
    .lean();
  return new Set(sessions.map((s) => String(s.contentId)));
};

export const getDailyStudyLogs = async (userId, limit = 30) => {
  const missions = await DailyMission.find({ userId })
    .sort({ date: -1 })
    .limit(limit)
    .lean();
  const sessions = await StudySession.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit * 4)
    .lean();
  const readings = await ReadingSession.find({ userId })
    .sort({ date: -1 })
    .limit(limit)
    .lean();
  const mocks = await MockTestResult.find({ userId })
    .sort({ date: -1 })
    .limit(limit)
    .lean();

  return { missions, sessions, readings, mocks };
};

export const getTotalStudyMinutes = async (userId, fromDate = null) => {
  const filter = { userId };
  if (fromDate) filter.date = { $gte: fromDate };

  const [videoAgg, readingAgg] = await Promise.all([
    StudySession.aggregate([
      { $match: { ...filter, type: { $in: ["video", "mock", "mission"] } } },
      { $group: { _id: null, total: { $sum: "$durationMinutes" } } },
    ]),
    ReadingSession.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$actualMinutes" } } },
    ]),
  ]);

  const videoMinutes = videoAgg[0]?.total || 0;
  const readingMinutes = readingAgg[0]?.total || 0;
  return { videoMinutes, readingMinutes, totalMinutes: videoMinutes + readingMinutes };
};
