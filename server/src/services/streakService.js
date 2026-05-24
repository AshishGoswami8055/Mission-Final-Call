import mongoose from "mongoose";
import DailyMission from "../models/DailyMission.js";
import ReadingSession from "../models/ReadingSession.js";
import StudySession from "../models/StudySession.js";
import { todayDateKey } from "../utils/subjectBuckets.js";

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

/** Sum video watch minutes for one calendar day. */
export const getDailyVideoMinutes = async (userId, dateKey) => {
  const rows = await StudySession.aggregate([
    {
      $match: {
        userId: toObjectId(userId),
        date: dateKey,
        type: "video",
      },
    },
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
        date: { $in: dateKeys },
        type: "video",
      },
    },
    { $group: { _id: "$date", total: { $sum: "$durationMinutes" } } },
  ]);
  return Object.fromEntries(rows.map((row) => [row._id, row.total || 0]));
};

/** Consecutive days with at least 1 hour of video watched. */
export const calculateVideoStreak = async (userId, asOf = new Date()) => {
  let streak = 0;
  const cursor = new Date(asOf);
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i += 1) {
    const date = todayDateKey(cursor);
    const minutes = await getDailyVideoMinutes(userId, date);
    const ok = isVideoStreakDayComplete(minutes);

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

export const buildVideoStreakStatus = async (userId, asOf = new Date()) => {
  const today = todayDateKey(asOf);
  const todayVideoMinutes = await getDailyVideoMinutes(userId, today);
  const streak = await calculateVideoStreak(userId, asOf);
  const goalMinutes = VIDEO_STREAK_GOAL_MINUTES;

  const dateKeys = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(asOf);
    d.setDate(d.getDate() - i);
    dateKeys.push(todayDateKey(d));
  }
  const minutesByDate = await getVideoMinutesByDates(userId, dateKeys);
  const recentDays = dateKeys.map((date) => {
    const minutes = date === today ? todayVideoMinutes : minutesByDate[date] || 0;
    return {
      date,
      minutes,
      complete: isVideoStreakDayComplete(minutes),
    };
  });

  return {
    streak,
    todayVideoMinutes,
    goalMinutes,
    todayComplete: isVideoStreakDayComplete(todayVideoMinutes),
    progressPercent: Math.min(100, Math.round((todayVideoMinutes / goalMinutes) * 100)),
    recentDays,
  };
};

export { isMissionDayComplete, isReadingDayComplete };
