import ReadingSession from "../models/ReadingSession.js";
import MockTestResult from "../models/MockTestResult.js";
import DailyMission from "../models/DailyMission.js";
import {
  getOrCreateTodayMission,
  completeMissionItem,
  generateDailyMission,
} from "../services/missionGenerationService.js";
import { buildAnalyticsOverview, buildIntelligenceReport } from "../services/analyticsService.js";
import { logStudySession } from "../services/studyHistoryService.js";
import {
  calculateDisciplineStreak,
  calculateReadingStreak,
  computeDisciplineScore,
} from "../services/streakService.js";
import { DEFAULT_READING_TARGET_MINUTES, todayDateKey } from "../utils/subjectBuckets.js";
import {
  enrichMissionItems,
  buildDailyTargetSummary,
  syncMissionProgressFromSummary,
} from "../services/missionSummaryService.js";
import { getOrCreateAiBriefing } from "../services/aiBriefingService.js";

const populateMissionDiscipline = async (userId, mission, reading) => {
  const streak = await calculateDisciplineStreak(userId);
  const readingProgress = reading?.targetMinutes
    ? Math.min(100, Math.round(((reading.actualMinutes || 0) / reading.targetMinutes) * 100))
    : 0;
  mission.disciplineScore = computeDisciplineScore({
    missionProgress: mission.progressPercent || 0,
    readingProgress,
    streak,
  });
  await mission.save();
  return mission;
};

export const getTodayMission = async (req, res) => {
  try {
    const userId = req.user._id;
    const mission = await getOrCreateTodayMission(userId);
    const dateKey = todayDateKey();
    let reading = await ReadingSession.findOne({ userId, date: dateKey });
    if (!reading) {
      reading = await ReadingSession.create({
        userId,
        date: dateKey,
        targetMinutes: DEFAULT_READING_TARGET_MINUTES,
      });
    }

    await enrichMissionItems(mission);
    const dailyTarget = buildDailyTargetSummary(mission, reading);
    syncMissionProgressFromSummary(mission, dailyTarget);
    await populateMissionDiscipline(userId, mission, reading);
    const streak = await calculateDisciplineStreak(userId);
    const readingStreak = await calculateReadingStreak(userId);
    const overview = await buildAnalyticsOverview(userId);
    overview.streak = streak;
    overview.readingStreak = readingStreak;

    const aiBriefing = await getOrCreateAiBriefing({
      userId,
      userName: req.user?.name || "Cadet",
      dailyTarget,
      overview,
      mission,
      force: req.query.refreshBriefing === "1",
    });

    res.json({
      mission: mission.toObject(),
      reading: reading.toObject(),
      dailyTarget,
      aiBriefing,
      userName: req.user?.name || "Cadet",
      streak,
      readingStreak,
      examCountdownDays: overview.examCountdownDays,
      totalStudyHours: overview.totalStudyHours,
      analytics: {
        disciplineScore: mission.disciplineScore,
        consistencyScore: overview.consistencyScore,
        missionCompletionRate: overview.missionCompletionRate,
        totalStudyHours: overview.totalStudyHours,
        strongestSubjects: overview.strongestSubjects,
        weakestSubjects: overview.weakestSubjects,
        weeklyChart: overview.weeklyChart,
        mockTrend: overview.mockTrend,
      },
    });
  } catch (error) {
    console.error("[mission.getToday]", error);
    res.status(500).json({ message: error.message || "Could not load today's mission" });
  }
};

export const refreshAiBriefing = async (req, res) => {
  try {
    const userId = req.user._id;
    const mission = await getOrCreateTodayMission(userId);
    const dateKey = todayDateKey();
    const reading =
      (await ReadingSession.findOne({ userId, date: dateKey })) ||
      (await ReadingSession.create({ userId, date: dateKey, targetMinutes: DEFAULT_READING_TARGET_MINUTES }));

    await enrichMissionItems(mission);
    const dailyTarget = buildDailyTargetSummary(mission, reading);
    const overview = await buildAnalyticsOverview(userId);

    const aiBriefing = await getOrCreateAiBriefing({
      userId,
      userName: req.user?.name || "Cadet",
      dailyTarget,
      overview,
      mission,
      force: true,
    });

    res.json({ aiBriefing, dailyTarget });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not refresh AI briefing" });
  }
};

export const regenerateTodayMission = async (req, res) => {
  try {
    const mission = await generateDailyMission(req.user._id, { force: true });
    res.json({ mission });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not regenerate mission" });
  }
};

export const completeMissionItemHandler = async (req, res) => {
  try {
    const { slot, contentId, paperId, durationMinutes } = req.body;
    const mission = await completeMissionItem(req.user._id, { slot, contentId, paperId });
    if (!mission) return res.status(404).json({ message: "No mission found for today" });

    if (slot && slot !== "reading" && (contentId || paperId)) {
      await logStudySession({
        userId: req.user._id,
        type: slot === "mock_test" ? "mock" : "video",
        durationMinutes: durationMinutes || 0,
        contentId: contentId || null,
        paperId: paperId || null,
        missionId: mission._id,
        slot,
        meta: { source: "mission_complete" },
      });
    }

    const dateKey = todayDateKey();
    const reading = await ReadingSession.findOne({ userId: req.user._id, date: dateKey });
    await populateMissionDiscipline(req.user._id, mission, reading);

    res.json({ mission });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not complete mission item" });
  }
};

export const getReadingToday = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = todayDateKey();
    let reading = await ReadingSession.findOne({ userId, date: dateKey });
    if (!reading) {
      reading = await ReadingSession.create({
        userId,
        date: dateKey,
        targetMinutes: DEFAULT_READING_TARGET_MINUTES,
      });
    }
    res.json({ reading });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not load reading session" });
  }
};

export const startReading = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = todayDateKey();
    let reading = await ReadingSession.findOne({ userId, date: dateKey });
    if (!reading) {
      reading = new ReadingSession({
        userId,
        date: dateKey,
        targetMinutes: DEFAULT_READING_TARGET_MINUTES,
      });
    }
    reading.status = "running";
    reading.startedAt = reading.startedAt || new Date();
    reading.pausedAt = null;
    await reading.save();
    res.json({ reading });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not start reading" });
  }
};

export const pauseReading = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = todayDateKey();
    const { elapsedSeconds = 0 } = req.body;
    const reading = await ReadingSession.findOne({ userId, date: dateKey });
    if (!reading) return res.status(404).json({ message: "No reading session today" });

    const addSecs = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
    reading.accumulatedSeconds = Math.max(reading.accumulatedSeconds || 0, addSecs);
    reading.actualMinutes = Math.floor(reading.accumulatedSeconds / 60);
    reading.status = "paused";
    reading.pausedAt = new Date();
    await reading.save();
    res.json({ reading });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not pause reading" });
  }
};

export const resumeReading = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = todayDateKey();
    const reading = await ReadingSession.findOne({ userId, date: dateKey });
    if (!reading) return res.status(404).json({ message: "No reading session today" });
    reading.status = "running";
    reading.pausedAt = null;
    await reading.save();
    res.json({ reading });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not resume reading" });
  }
};

export const completeReading = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = todayDateKey();
    const { elapsedSeconds = 0 } = req.body;
    const reading = await ReadingSession.findOne({ userId, date: dateKey });
    if (!reading) return res.status(404).json({ message: "No reading session today" });

    const addSecs = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
    reading.accumulatedSeconds = Math.max(reading.accumulatedSeconds || 0, addSecs);
    reading.actualMinutes = Math.max(
      reading.actualMinutes || 0,
      Math.floor(reading.accumulatedSeconds / 60)
    );
    reading.status = "completed";
    reading.completedAt = new Date();
    await reading.save();

    await logStudySession({
      userId,
      type: "reading",
      durationMinutes: reading.actualMinutes,
      meta: { source: "reading_complete" },
    });

    await completeMissionItem(userId, { slot: "reading" });

    const mission = await DailyMission.findOne({ userId, date: dateKey });
    if (mission) await populateMissionDiscipline(userId, mission, reading);

    res.json({ reading, mission });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not complete reading" });
  }
};

export const submitMockTest = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      paperId,
      title,
      score = 0,
      totalQuestions = 0,
      attemptedQuestions = 0,
      correctAnswers = 0,
      timeTakenMinutes = 0,
      weakSubjects = [],
    } = req.body;

    if (!paperId) return res.status(400).json({ message: "paperId is required" });

    const accuracyPercent =
      attemptedQuestions > 0
        ? Math.round((Number(correctAnswers) / Number(attemptedQuestions)) * 100)
        : 0;

    const result = await MockTestResult.create({
      userId,
      paperId,
      date: todayDateKey(),
      title: title || "Sunday Mock Test",
      score: Number(score) || 0,
      totalQuestions: Number(totalQuestions) || 0,
      attemptedQuestions: Number(attemptedQuestions) || 0,
      correctAnswers: Number(correctAnswers) || 0,
      accuracyPercent,
      timeTakenMinutes: Number(timeTakenMinutes) || 0,
      weakSubjects: Array.isArray(weakSubjects) ? weakSubjects : [],
    });

    await logStudySession({
      userId,
      type: "mock",
      durationMinutes: timeTakenMinutes,
      paperId,
      meta: { score, accuracyPercent },
    });

    await completeMissionItem(userId, { slot: "mock_test", paperId });

    res.status(201).json({ result });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not save mock test" });
  }
};

export const getMockHistory = async (req, res) => {
  try {
    const results = await MockTestResult.find({ userId: req.user._id })
      .sort({ date: -1 })
      .limit(30)
      .lean();
    res.json({ items: results });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not load mock history" });
  }
};

export const getAnalyticsOverview = async (req, res) => {
  try {
    const overview = await buildAnalyticsOverview(req.user._id);
    res.json(overview);
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not load analytics" });
  }
};

export const getIntelligenceReport = async (req, res) => {
  try {
    const report = await buildIntelligenceReport(req.user._id);
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not load intelligence report" });
  }
};

export const logSession = async (req, res) => {
  try {
    const session = await logStudySession({
      userId: req.user._id,
      ...req.body,
    });
    res.status(201).json({ session });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not log session" });
  }
};

export const updateReadingTarget = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = todayDateKey();
    const targetMinutes = Math.max(15, Math.min(240, Number(req.body.targetMinutes) || 60));
    const reading = await ReadingSession.findOneAndUpdate(
      { userId, date: dateKey },
      { targetMinutes },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ reading });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not update reading target" });
  }
};
