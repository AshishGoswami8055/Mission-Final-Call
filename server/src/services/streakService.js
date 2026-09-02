import mongoose from "mongoose";
import DailyMission from "../models/DailyMission.js";
import ReadingSession from "../models/ReadingSession.js";
import StudySession from "../models/StudySession.js";
import MockTestResult from "../models/MockTestResult.js";
import PaperProgress from "../models/PaperProgress.js";
import { APP_TIMEZONE, addDaysToDateKey, istDayBounds, todayDateKey } from "../utils/subjectBuckets.js";

export const VIDEO_STREAK_GOAL_MINUTES = 60;

const isMissionDayComplete = (mission) => {
  if (!mission?.items?.length) return false;
  const required = mission.items.filter((i) => i.slot !== "mock_test" || mission.missionType === "sunday_mock");
  return required.length > 0 && required.every((i) => i.completed);
};

const isReadingDayComplete = (reading) =>
  reading?.status === "completed" || (reading?.actualMinutes || 0) >= (reading?.targetMinutes || 60);

/** Count consecutive days (including today if complete) with mission progress. */
export const calculateDisciplineStreak = async (userId, asOf = new Date()) => {
  let streak = 0;
  const cursor = new Date(asOf);
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i += 1) {
    const date = todayDateKey(cursor);
    const [mission, reading] = await Promise.all([
      DailyMission.findOne({ userId, date }).lean(),
      ReadingSession.findOne({ userId, date }).lean(),
    ]);

    const missionOk = mission && (mission.progressPercent >= 75 || isMissionDayComplete(mission));
    const readingOk = isReadingDayComplete(reading);
    const dayOk = missionOk || readingOk;

    if (i === 0 && !dayOk) {
      // Today not done yet — check from yesterday
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (!dayOk) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

export const calculateReadingStreak = async (userId, asOf = new Date()) => {
  let streak = 0;
  const cursor = new Date(asOf);
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i += 1) {
    const date = todayDateKey(cursor);
    const reading = await ReadingSession.findOne({ userId, date }).lean();
    const ok = isReadingDayComplete(reading);

    if (i === 0 && !ok) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (!ok) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

export const computeDisciplineScore = ({ missionProgress = 0, readingProgress = 0, streak = 0 }) => {
  const base = missionProgress * 0.55 + readingProgress * 0.25;
  const streakBonus = Math.min(20, streak * 2);
  return Math.min(100, Math.round(base + streakBonus));
};

const toObjectId = (userId) =>
  userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(String(userId));

export const isVideoStreakDayComplete = (minutes) =>
  (Number(minutes) || 0) >= VIDEO_STREAK_GOAL_MINUTES;

export const isStudyStreakDayComplete = (minutes, hasMock = false) =>
  isVideoStreakDayComplete(minutes) || Boolean(hasMock);

export const getMockDateSet = async (userId, dateKeys = []) => {
  const set = new Set();
  if (!dateKeys.length) return set;
  const uid = toObjectId(userId);
  const starts = dateKeys.map((key) => istDayBounds(key).start);
  const ends = dateKeys.map((key) => istDayBounds(key).end);
  const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
  const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));

  const [results, sessions, papers] = await Promise.all([
    MockTestResult.find({ userId: uid, date: { $in: dateKeys } }).select("date").lean(),
    StudySession.find({
      userId: uid,
      type: "mock",
      $or: [{ date: { $in: dateKeys } }, { startedAt: { $gte: minStart, $lt: maxEnd } }],
    })
      .select("date startedAt createdAt")
      .lean(),
    PaperProgress.find({
      userId: uid,
      attempted: true,
      attemptedAt: { $gte: minStart, $lt: maxEnd },
    })
      .select("attemptedAt")
      .lean(),
  ]);

  for (const row of results) if (row.date) set.add(row.date);
  for (const session of sessions) {
    set.add(session.date || todayDateKey(session.startedAt || session.createdAt));
  }
  for (const paper of papers) {
    if (paper.attemptedAt) set.add(todayDateKey(paper.attemptedAt));
  }
  return set;
};

/** Sum video watch minutes for one calendar day (IST), using when the session happened. */
export const getDailyVideoMinutes = async (userId, dateKey) => {
  const rows = await StudySession.aggregate([
    {
      $match: {
        userId: toObjectId(userId),
        type: "video",
      },
    },
    {
      $addFields: {
        istDate: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: { $ifNull: ["$startedAt", "$createdAt"] },
            timezone: APP_TIMEZONE,
          },
        },
      },
    },
    { $match: { istDate: dateKey } },
    { $group: { _id: null, total: { $sum: "$durationMinutes" } } },
  ]);
  return rows[0]?.total || 0;
};

/** Batch lookup for recent streak calendar dots. */
export const getVideoMinutesByDates = async (userId, dateKeys = []) => {
  if (!dateKeys.length) return {};
  const rows = await StudySession.aggregate([
    {
      $match: {
        userId: toObjectId(userId),
        type: "video",
      },
    },
    {
      $addFields: {
        istDate: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: { $ifNull: ["$startedAt", "$createdAt"] },
            timezone: APP_TIMEZONE,
          },
        },
      },
    },
    { $match: { istDate: { $in: dateKeys } } },
    { $group: { _id: "$istDate", total: { $sum: "$durationMinutes" } } },
  ]);
  return Object.fromEntries(rows.map((row) => [row._id, row.total || 0]));
};

/** Consecutive days with 1 hour of video or a completed mock test. */
export const calculateVideoStreak = async (userId, asOf = new Date()) => {
  const keys = [];
  let dateKey = todayDateKey(asOf);
  for (let i = 0; i < 60; i += 1) {
    keys.push(dateKey);
    dateKey = addDaysToDateKey(dateKey, -1);
  }

  const [minutesByDate, mockDates] = await Promise.all([
    getVideoMinutesByDates(userId, keys),
    getMockDateSet(userId, keys),
  ]);

  dateKey = todayDateKey(asOf);
  if (!isStudyStreakDayComplete(minutesByDate[dateKey] || 0, mockDates.has(dateKey))) {
    dateKey = addDaysToDateKey(dateKey, -1);
  }

  let streak = 0;
  for (let i = 0; i < 60; i += 1) {
    const minutes = minutesByDate[dateKey] || 0;
    if (!isStudyStreakDayComplete(minutes, mockDates.has(dateKey))) break;
    streak += 1;
    dateKey = addDaysToDateKey(dateKey, -1);
  }

  return streak;
};

export const buildVideoStreakStatus = async (userId, asOf = new Date()) => {
  const today = todayDateKey(asOf);
  const dateKeys = [];
  for (let i = 6; i >= 0; i -= 1) {
    dateKeys.push(addDaysToDateKey(today, -i));
  }

  const [todayVideoMinutes, streak, minutesByDate, mockDates] = await Promise.all([
    getDailyVideoMinutes(userId, today),
    calculateVideoStreak(userId, asOf),
    getVideoMinutesByDates(userId, dateKeys),
    getMockDateSet(userId, dateKeys),
  ]);
  const goalMinutes = VIDEO_STREAK_GOAL_MINUTES;

  const recentDays = dateKeys.map((date) => {
    const minutes = date === today ? todayVideoMinutes : minutesByDate[date] || 0;
    const hasMock = mockDates.has(date);
    return {
      date,
      minutes,
      hasMock,
      complete: isStudyStreakDayComplete(minutes, hasMock),
    };
  });

  const todayHasMock = mockDates.has(today);
  return {
    streak,
    todayVideoMinutes,
    goalMinutes,
    todayComplete: isStudyStreakDayComplete(todayVideoMinutes, todayHasMock),
    todayHasMock,
    progressPercent: Math.min(
      100,
      Math.round(((todayHasMock ? goalMinutes : todayVideoMinutes) / goalMinutes) * 100)
    ),
    recentDays,
  };
};

/** Record a mock-test day so the study streak continues without 60 min of video. */
export const creditMockStreakDay = async (userId, dateKey) => {
  const key = dateKey || addDaysToDateKey(todayDateKey(), -1);
  const videoId = `mock-streak:${key}`;
  const { start } = istDayBounds(key);
  const startedAt = new Date(start.getTime() + 10 * 60 * 60 * 1000);
  const durationMinutes = 120;

  const existing = await StudySession.findOne({
    userId,
    type: "mock",
    "meta.videoId": videoId,
  });
  if (existing) {
    existing.date = key;
    existing.durationMinutes = Math.max(existing.durationMinutes || 0, durationMinutes);
    existing.startedAt = existing.startedAt || startedAt;
    existing.endedAt = new Date(startedAt.getTime() + existing.durationMinutes * 60 * 1000);
    await existing.save();
    return existing;
  }

  return StudySession.create({
    userId,
    date: key,
    type: "mock",
    durationMinutes,
    startedAt,
    endedAt: new Date(startedAt.getTime() + durationMinutes * 60 * 1000),
    meta: {
      title: "CDS mock test",
      source: "mock-streak-credit",
      videoId,
      note: "Mock test counted toward study streak",
    },
  });
};

const backfillMinutesForOffset = (daysBeforeToday) => (daysBeforeToday === 1 ? 90 : 60);

/** Insert or top-up verified video minutes for past calendar days (streak recovery). */
export const backfillVideoStreakDays = async (userId, dayCount = 4, asOf = new Date()) => {
  const days = Math.min(30, Math.max(1, Number(dayCount) || 4));
  const today = todayDateKey(asOf);
  const touched = [];

  for (let offset = days; offset >= 1; offset -= 1) {
    const dateKey = addDaysToDateKey(today, -offset);
    const minutes = backfillMinutesForOffset(offset);
    const videoId = `manual-backfill:${dateKey}`;
    const { start, end } = istDayBounds(dateKey);
    const startedAt = new Date(start.getTime() + 12 * 60 * 60 * 1000);

    const existing = await StudySession.findOne({
      userId,
      type: "video",
      "meta.videoId": videoId,
      startedAt: { $gte: start, $lt: end },
    });

    if (existing) {
      existing.durationMinutes = Math.max(existing.durationMinutes || 0, minutes);
      existing.date = dateKey;
      existing.meta = {
        ...(existing.meta || {}),
        source: "manual-backfill",
        note: "Verified study streak recovery",
        videoId,
      };
      existing.endedAt = new Date(startedAt.getTime() + existing.durationMinutes * 60 * 1000);
      await existing.save();
      touched.push({ date: dateKey, minutes: existing.durationMinutes, action: "updated" });
      continue;
    }

    await StudySession.create({
      userId,
      date: dateKey,
      type: "video",
      contentId: null,
      durationMinutes: minutes,
      subjectId: null,
      subjectName: "",
      startedAt,
      endedAt: new Date(startedAt.getTime() + minutes * 60 * 1000),
      meta: {
        title: "Manual streak recovery",
        source: "manual-backfill",
        note: "Verified study streak recovery",
        videoId,
      },
    });
    touched.push({ date: dateKey, minutes, action: "created" });
  }

  const streak = await buildVideoStreakStatus(userId, asOf);
  return { touched, streak };
};

export { isMissionDayComplete, isReadingDayComplete };
