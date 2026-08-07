import Vocabulary from "../models/Vocabulary.js";
import VocabularyReviewLog from "../models/VocabularyReviewLog.js";
import VocabularyPracticeSession from "../models/VocabularyPracticeSession.js";
import { buildVocabularyScope, vocabularyDateKey } from "../utils/vocabularyDomain.js";
import { calculateWeakWordScore, isWeakVocabulary } from "./vocabularySrsService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const calculatePracticeStreak = (dateKeys = []) => {
  const set = new Set(dateKeys);
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!set.has(vocabularyDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (set.has(vocabularyDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export const getVocabularyDashboardData = async (userId) => {
  const now = new Date();
  const scope = buildVocabularyScope(userId);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [items, recentLogs, recentSessions] = await Promise.all([
    Vocabulary.find(scope)
      .select(
        "level nextReviewAt wrongCount correctCount confidence lastWrongAt createdAt type rootWord"
      )
      .lean(),
    VocabularyReviewLog.find({ userId, createdAt: { $gte: thirtyDaysAgo } })
      .select("correct createdAt mode")
      .sort({ createdAt: -1 })
      .lean(),
    VocabularyPracticeSession.find({
      userId,
      status: "completed",
      completedAt: { $gte: thirtyDaysAgo },
    })
      .select("mode correctAnswers wrongAnswers completedAt")
      .sort({ completedAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const dueToday = items.filter(
    (item) => new Date(item.nextReviewAt || 0).getTime() <= now.getTime()
  ).length;
  const weak = items.filter((item) => isWeakVocabulary(item, now)).length;
  const reviewed = recentLogs.length;
  const correct = recentLogs.filter((log) => log.correct).length;
  const streak = calculatePracticeStreak(
    recentLogs.map((log) => vocabularyDateKey(log.createdAt))
  );

  return {
    counts: {
      total: items.length,
      dueToday,
      new: items.filter((item) => item.level === "new").length,
      learning: items.filter((item) => item.level === "learning").length,
      mastered: items.filter((item) => item.level === "mastered").length,
      weak,
      rootFamilies: new Set(items.map((item) => item.rootWord).filter(Boolean)).size,
    },
    consistency: {
      streak,
      reviewedLast30Days: reviewed,
      accuracyLast30Days: reviewed ? Math.round((correct / reviewed) * 100) : 0,
    },
    recentSessions,
    recommendedMode: weak > 0 ? "weak" : dueToday > 0 ? "mixed" : "exam",
  };
};

export const getWeakVocabularyItems = async (
  userId,
  { type = "all", limit = 50 } = {}
) => {
  const items = await Vocabulary.find(buildVocabularyScope(userId, { type }))
    .sort({ lastWrongAt: -1, nextReviewAt: 1 })
    .limit(Math.min(250, Math.max(20, Number(limit) * 5)))
    .lean();

  return items
    .map((item) => ({ ...item, weakScore: calculateWeakWordScore(item) }))
    .filter((item) => isWeakVocabulary(item))
    .sort((a, b) => b.weakScore - a.weakScore)
    .slice(0, Math.min(100, Math.max(1, Number(limit) || 50)));
};

export const getRootFamiliesData = async (
  userId,
  { search = "", limit = 100 } = {}
) => {
  const filter = {
    ...buildVocabularyScope(userId),
    rootWord: { $nin: ["", null] },
  };
  if (search) {
    const safeSearch = escapeRegex(search);
    filter.$and = [
      {
        $or: [
          { rootWord: { $regex: safeSearch, $options: "i" } },
          { rootMeaning: { $regex: safeSearch, $options: "i" } },
          { word: { $regex: safeSearch, $options: "i" } },
          { tags: { $elemMatch: { $regex: safeSearch, $options: "i" } } },
        ],
      },
    ];
  }

  const items = await Vocabulary.find(filter)
    .sort({ rootWord: 1, word: 1 })
    .limit(Math.min(1000, Math.max(20, Number(limit) * 10)))
    .lean();
  const families = new Map();
  for (const item of items) {
    const key = String(item.rootWord).trim().toLowerCase();
    if (!families.has(key)) {
      families.set(key, {
        rootWord: item.rootWord,
        rootMeaning: item.rootMeaning || "",
        words: [],
        weakCount: 0,
      });
    }
    const family = families.get(key);
    family.words.push({
      _id: item._id,
      word: item.word,
      meaning: item.meaning,
      difficulty: item.difficulty,
      confidence: item.confidence,
    });
    if (isWeakVocabulary(item)) family.weakCount += 1;
  }

  return [...families.values()]
    .sort((a, b) => b.words.length - a.words.length)
    .slice(0, Math.min(200, Math.max(1, Number(limit) || 100)));
};

const buildDailyAccuracy = (logs, days = 14) => {
  const map = new Map();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * DAY_MS);
    map.set(vocabularyDateKey(date), { date: vocabularyDateKey(date), total: 0, correct: 0 });
  }
  for (const log of logs) {
    const key = vocabularyDateKey(log.createdAt);
    const row = map.get(key);
    if (!row) continue;
    row.total += 1;
    if (log.correct) row.correct += 1;
  }
  return [...map.values()].map((row) => ({
    ...row,
    accuracy: row.total ? Math.round((row.correct / row.total) * 100) : 0,
  }));
};

export const aggregateVocabularyModePerformance = (logs = []) => {
  const modeMap = new Map();
  for (const log of logs) {
    const mode = modeMap.get(log.mode) || { mode: log.mode, total: 0, correct: 0 };
    mode.total += 1;
    if (log.correct) mode.correct += 1;
    modeMap.set(log.mode, mode);
  }
  return [...modeMap.values()].map((row) => ({
    ...row,
    accuracy: row.total ? Math.round((row.correct / row.total) * 100) : 0,
  }));
};

export const buildVocabularyReviewQueueHealth = (items = [], now = new Date()) => ({
  overdue: items.filter(
    (item) => new Date(item.nextReviewAt || 0).getTime() < now.getTime() - DAY_MS
  ).length,
  dueToday: items.filter(
    (item) => new Date(item.nextReviewAt || 0).getTime() <= now.getTime()
  ).length,
  nextSevenDays: items.filter((item) => {
    const due = new Date(item.nextReviewAt || 0).getTime();
    return due > now.getTime() && due <= now.getTime() + 7 * DAY_MS;
  }).length,
});

export const getVocabularyAnalyticsData = async (userId) => {
  const now = new Date();
  const since = new Date(now.getTime() - 90 * DAY_MS);
  const [items, logs, sessions] = await Promise.all([
    Vocabulary.find(buildVocabularyScope(userId)).lean(),
    VocabularyReviewLog.find({ userId, createdAt: { $gte: since } })
      .sort({ createdAt: 1 })
      .lean(),
    VocabularyPracticeSession.find({
      userId,
      status: "completed",
      completedAt: { $gte: since },
    })
      .sort({ completedAt: -1 })
      .lean(),
  ]);

  const categoryMap = new Map();
  for (const item of items) {
    const category = item.examTag || item.type || "vocabulary";
    const row = categoryMap.get(category) || {
      category,
      total: 0,
      correct: 0,
      wrong: 0,
    };
    row.total += 1;
    row.correct += Number(item.correctCount) || 0;
    row.wrong += Number(item.wrongCount) || 0;
    categoryMap.set(category, row);
  }

  const categories = [...categoryMap.values()].map((row) => ({
    ...row,
    accuracy:
      row.correct + row.wrong
        ? Math.round((row.correct / (row.correct + row.wrong)) * 100)
        : 0,
  }));
  const reviewQueue = buildVocabularyReviewQueueHealth(items, now);

  return {
    totals: {
      stored: items.length,
      mastered: items.filter((item) => item.level === "mastered").length,
      weak: items.filter((item) => isWeakVocabulary(item)).length,
      reviewed: logs.length,
      completedSessions: sessions.length,
    },
    streak: calculatePracticeStreak(logs.map((log) => vocabularyDateKey(log.createdAt))),
    dailyAccuracy: buildDailyAccuracy(logs),
    modePerformance: aggregateVocabularyModePerformance(logs),
    mostMissed: [...items]
      .filter((item) => (Number(item.wrongCount) || 0) > 0)
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
      .slice(0, 12)
      .map((item) => ({
        _id: item._id,
        word: item.word,
        meaning: item.meaning,
        wrongCount: item.wrongCount || 0,
        correctCount: item.correctCount || 0,
        weakScore: calculateWeakWordScore(item),
      })),
    strongestCategories: [...categories]
      .filter((row) => row.correct + row.wrong > 0)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 6),
    weakestCategories: [...categories]
      .filter((row) => row.correct + row.wrong > 0)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 6),
    reviewQueue,
  };
};
