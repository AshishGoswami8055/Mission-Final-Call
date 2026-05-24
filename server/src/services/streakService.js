import DailyMission from "../models/DailyMission.js";
import ReadingSession from "../models/ReadingSession.js";
import { todayDateKey } from "../utils/subjectBuckets.js";

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

export { isMissionDayComplete, isReadingDayComplete };
