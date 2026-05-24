import DailyMission from "../models/DailyMission.js";
import StudySession from "../models/StudySession.js";
import ReadingSession from "../models/ReadingSession.js";
import MockTestResult from "../models/MockTestResult.js";
import StudyAnalytics from "../models/StudyAnalytics.js";
import Subject from "../models/Subject.js";
import Content from "../models/Content.js";
import Progress from "../models/Progress.js";
import { calculateDisciplineStreak, calculateReadingStreak, computeDisciplineScore } from "./streakService.js";
import { getDailyStudyLogs, getTotalStudyMinutes } from "./studyHistoryService.js";
import { todayDateKey } from "../utils/subjectBuckets.js";

const EXAM_DATE = new Date("2026-09-13T00:00:00");

const getExamCountdownDays = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exam = new Date(EXAM_DATE);
  exam.setHours(0, 0, 0, 0);
  return Math.ceil((exam - now) / (86400000));
};

const weekKey = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
};

const monthKey = (date = new Date()) => todayDateKey(date).slice(0, 7);

const computeSubjectStrength = async (userId) => {
  const subjects = await Subject.find({}).select("_id name").lean();
  const stats = [];

  for (const subject of subjects) {
    const contents = await Content.find({ subjectId: subject._id }).select("_id").lean();
    if (!contents.length) continue;
    const completed = await Progress.countDocuments({
      userId,
      contentId: { $in: contents.map((c) => c._id) },
      completed: true,
    });
    const rate = completed / contents.length;
    stats.push({ name: subject.name, rate, total: contents.length, completed });
  }

  stats.sort((a, b) => b.rate - a.rate);
  return {
    strongest: stats.slice(0, 3).map((s) => s.name),
    weakest: stats.slice(-3).reverse().map((s) => s.name),
    all: stats,
  };
};

export const buildAnalyticsOverview = async (userId) => {
  const today = todayDateKey();
  const streak = await calculateDisciplineStreak(userId);
  const readingStreak = await calculateReadingStreak(userId);
  const totals = await getTotalStudyMinutes(userId);

  const todayMission = await DailyMission.findOne({ userId, date: today }).lean();
  const todayReading = await ReadingSession.findOne({ userId, date: today }).lean();

  const missionProgress = todayMission?.progressPercent || 0;
  const readingTarget = todayReading?.targetMinutes || 60;
  const readingActual = todayReading?.actualMinutes || 0;
  const readingProgress = readingTarget ? Math.min(100, Math.round((readingActual / readingTarget) * 100)) : 0;

  const disciplineScore = computeDisciplineScore({
    missionProgress,
    readingProgress,
    streak,
  });

  const subjectStrength = await computeSubjectStrength(userId);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartKey = todayDateKey(weekStart);

  const weekSessions = await StudySession.find({
    userId,
    date: { $gte: weekStartKey },
  }).lean();

  const weekByDay = {};
  for (let i = 0; i < 7; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    weekByDay[todayDateKey(d)] = 0;
  }
  for (const s of weekSessions) {
    weekByDay[s.date] = (weekByDay[s.date] || 0) + (s.durationMinutes || 0);
  }
  const weekReadings = await ReadingSession.find({
    userId,
    date: { $gte: weekStartKey },
  }).lean();
  for (const r of weekReadings) {
    weekByDay[r.date] = (weekByDay[r.date] || 0) + (r.actualMinutes || 0);
  }

  const weeklyChart = Object.entries(weekByDay).map(([date, minutes]) => ({ date, minutes }));

  const monthStart = today.slice(0, 7) + "-01";
  const monthMissions = await DailyMission.find({
    userId,
    date: { $gte: monthStart },
  }).lean();
  const completedMissions = monthMissions.filter((m) => m.status === "completed").length;
  const missionCompletionRate = monthMissions.length
    ? Math.round((completedMissions / monthMissions.length) * 100)
    : 0;

  const activeDays = new Set([
    ...weekSessions.map((s) => s.date),
    ...weekReadings.filter((r) => r.actualMinutes > 0).map((r) => r.date),
  ]).size;
  const consistencyScore = Math.round((activeDays / 7) * 100);

  const mockTrend = await MockTestResult.find({ userId })
    .sort({ date: -1 })
    .limit(8)
    .select("date accuracyPercent score title")
    .lean();

  return {
    today,
    examCountdownDays: getExamCountdownDays(),
    streak,
    readingStreak,
    readingStreak,
    disciplineScore,
    totalStudyHours: Math.round((totals.totalMinutes / 60) * 10) / 10,
    totalStudyMinutes: totals.totalMinutes,
    videoMinutes: totals.videoMinutes,
    readingMinutes: totals.readingMinutes,
    missionProgress,
    readingProgress,
    readingTarget,
    readingActual,
    missionCompletionRate,
    consistencyScore,
    strongestSubjects: subjectStrength.strongest,
    weakestSubjects: subjectStrength.weakest,
    subjectStats: subjectStrength.all,
    weeklyChart,
    mockTrend,
    todayMission,
  };
};

export const buildIntelligenceReport = async (userId) => {
  const overview = await buildAnalyticsOverview(userId);
  const logs = await getDailyStudyLogs(userId, 60);

  const dailyLogs = logs.missions.map((m) => ({
    date: m.date,
    type: "mission",
    progressPercent: m.progressPercent,
    status: m.status,
    itemsCompleted: m.items.filter((i) => i.completed).length,
    itemsTotal: m.items.length,
  }));

  const videoLogs = logs.sessions
    .filter((s) => s.type === "video")
    .map((s) => ({
      date: s.date,
      title: s.meta?.title || s.subjectName || "Video",
      durationMinutes: s.durationMinutes,
      subjectName: s.subjectName,
    }));

  const readingLogs = logs.readings.map((r) => ({
    date: r.date,
    actualMinutes: r.actualMinutes,
    targetMinutes: r.targetMinutes,
    status: r.status,
  }));

  const mockLogs = logs.mocks.map((m) => ({
    date: m.date,
    title: m.title,
    score: m.score,
    accuracyPercent: m.accuracyPercent,
    timeTakenMinutes: m.timeTakenMinutes,
    weakSubjects: m.weakSubjects,
  }));

  const monthlyInsights = {
    periodKey: monthKey(),
    missionCompletionRate: overview.missionCompletionRate,
    consistencyScore: overview.consistencyScore,
    totalHours: overview.totalStudyHours,
  };

  return {
    overview,
    dailyLogs,
    videoLogs,
    readingLogs,
    mockLogs,
    weeklySummaries: overview.weeklyChart,
    monthlyInsights,
  };
};

export const upsertAnalyticsSnapshot = async (userId, period, periodKey, payload) => {
  return StudyAnalytics.findOneAndUpdate(
    { userId, period, periodKey },
    { userId, period, periodKey, ...payload },
    { upsert: true, new: true }
  );
};

export { weekKey, monthKey };
