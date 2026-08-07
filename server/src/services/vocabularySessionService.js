import Vocabulary from "../models/Vocabulary.js";
import VocabularyPracticeSession from "../models/VocabularyPracticeSession.js";
import VocabularyReviewLog from "../models/VocabularyReviewLog.js";
import StudySession from "../models/StudySession.js";
import { buildVocabularyScope, vocabularyDateKey } from "../utils/vocabularyDomain.js";
import {
  generateVocabularyQuestions,
  PRACTICE_MODES,
  sanitizeQuestion,
  validateQuestionAnswer,
} from "./vocabularyQuestionService.js";
import {
  applySrsReview,
  deriveReviewResult,
  isWeakVocabulary,
} from "./vocabularySrsService.js";

const getSessionWithQuestions = (id, userId) =>
  VocabularyPracticeSession.findOne({ _id: id, userId }).select("+questions");

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const calculateVocabularySessionMetrics = (answers = []) => {
  const correctAnswers = answers.filter((answer) => answer.correct).length;
  const wrongAnswers = answers.filter((answer) => !answer.correct).length;
  const skippedQuestions = answers.filter((answer) => answer.skipped).length;
  const averageResponseTime = answers.length
    ? Math.round(
        answers.reduce((sum, answer) => sum + (Number(answer.responseTimeMs) || 0), 0) /
          answers.length
      )
    : 0;
  return {
    correctAnswers,
    wrongAnswers,
    skippedQuestions,
    averageResponseTime,
    accuracy: answers.length ? Math.round((correctAnswers / answers.length) * 100) : 0,
  };
};

const buildSessionSummary = (session) => {
  const attempted = session.correctAnswers + session.wrongAnswers;
  return {
    sessionId: session._id,
    mode: session.mode,
    type: session.type,
    timed: Boolean(session.timed),
    examMode: Boolean(session.examMode),
    status: session.status,
    totalQuestions: session.questionCount,
    answeredQuestions: session.answers.length,
    correctAnswers: session.correctAnswers,
    wrongAnswers: session.wrongAnswers,
    skippedQuestions: session.skippedQuestions,
    accuracy: attempted ? Math.round((session.correctAnswers / attempted) * 100) : 0,
    averageResponseTime: Math.round(session.averageResponseTime || 0),
    weakWordsSeen: session.weakWordsSeen,
    reviewUpdatesApplied: session.reviewUpdatesApplied,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    durationSeconds: session.durationSeconds,
  };
};

const logVocabularyStudySession = async (session, userId) => {
  const endedAt = session.completedAt || new Date();
  const existingLog = await StudySession.findOne({
    userId,
    type: "vocabulary",
    "meta.vocabularySessionId": String(session._id),
  });
  if (existingLog) return existingLog;
  const durationMinutes = Math.max(
    1,
    Math.round((endedAt.getTime() - new Date(session.startedAt).getTime()) / 60000)
  );
  return StudySession.create({
    userId,
    date: vocabularyDateKey(endedAt),
    type: "vocabulary",
    durationMinutes,
    startedAt: session.startedAt,
    endedAt,
    meta: {
      vocabularySessionId: String(session._id),
      mode: session.mode,
      correctAnswers: session.correctAnswers,
      wrongAnswers: session.wrongAnswers,
      accuracy:
        session.answers.length > 0
          ? Math.round((session.correctAnswers / session.answers.length) * 100)
          : 0,
    },
  });
};

const buildItemFilter = (userId, options) => {
  const filter = buildVocabularyScope(userId, { type: options.type || "all" });
  if (options.rootWord) {
    filter.rootWord = {
      $regex: `^${escapeRegex(String(options.rootWord).trim())}$`,
      $options: "i",
    };
  }
  if (options.examMode || options.mode === "exam") {
    filter.$and = [
      {
        $or: [
          { examTag: { $nin: ["", null] } },
          { type: { $in: ["idiom", "one_word"] } },
          { tags: { $in: [/cds/i, /pyq/i, /synonym/i, /antonym/i, /homonym/i, /confus/i] } },
        ],
      },
    ];
  }
  return filter;
};

export const startVocabularySession = async (userId, options = {}) => {
  const mode = PRACTICE_MODES.includes(options.mode) ? options.mode : "mixed";
  const questionCount = Math.min(50, Math.max(1, Number(options.questionCount) || 10));
  const pool = await Vocabulary.find(buildVocabularyScope(userId))
    .sort({ nextReviewAt: 1, lastWrongAt: -1, createdAt: -1 })
    .limit(500)
    .lean();

  let candidates = await Vocabulary.find(buildItemFilter(userId, { ...options, mode }))
    .sort({ nextReviewAt: 1, lastWrongAt: -1, createdAt: -1 })
    .limit(Math.max(questionCount * 5, 100))
    .lean();

  if (mode === "weak") candidates = candidates.filter((item) => isWeakVocabulary(item));
  if (mode === "roots" && !options.rootWord) {
    candidates = candidates.filter((item) => item.rootWord);
  }
  if (!candidates.length) {
    candidates = pool;
  }
  if (!candidates.length) {
    const error = new Error("Add vocabulary items before starting a practice session.");
    error.statusCode = 400;
    throw error;
  }

  const questions = generateVocabularyQuestions({
    items: candidates,
    pool,
    mode,
    limit: Math.min(questionCount, candidates.length),
  });
  const session = await VocabularyPracticeSession.create({
    userId,
    mode,
    type: ["vocabulary", "idiom", "one_word"].includes(options.type)
      ? options.type
      : "all",
    examMode: Boolean(options.examMode || mode === "exam"),
    timed: Boolean(options.timed || mode === "timed" || mode === "exam"),
    durationSeconds: Math.max(0, Number(options.durationSeconds) || 0),
    questionCount: questions.length,
    questions,
    startedAt: new Date(),
  });

  return {
    session: buildSessionSummary(session),
    question: sanitizeQuestion(questions[0]),
  };
};

const buildSessionReportExtras = async (session, userId) => {
  const missedIds = [
    ...new Set(
      session.answers
        .filter((answer) => !answer.correct)
        .map((answer) => String(answer.vocabularyId))
    ),
  ];
  const missedItems = missedIds.length
    ? await Vocabulary.find({ _id: { $in: missedIds }, userId })
        .select("word meaning type examTag wrongCount confidence nextReviewAt")
        .lean()
    : [];
  const categoryCounts = new Map();
  for (const answer of session.answers.filter((row) => !row.correct)) {
    const question = session.questions.find(
      (row) => String(row.vocabularyId) === String(answer.vocabularyId)
    );
    const category =
      question?.explanation?.examTag || question?.type || answer.questionType || "vocabulary";
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }
  return {
    weakCategories: [...categoryCounts.entries()]
      .map(([category, misses]) => ({ category, misses }))
      .sort((a, b) => b.misses - a.misses),
    recommendedReview: missedItems,
  };
};

const buildFullSessionSummary = async (session, userId) => {
  const summary = buildSessionSummary(session);
  if (session.status !== "completed") return summary;
  return { ...summary, ...(await buildSessionReportExtras(session, userId)) };
};

export const getVocabularySession = async (userId, sessionId) => {
  const session = await getSessionWithQuestions(sessionId, userId);
  if (!session) return null;
  const question =
    session.status === "active" ? session.questions[session.currentIndex] || null : null;
  return {
    session: await buildFullSessionSummary(session, userId),
    question: question ? sanitizeQuestion(question) : null,
  };
};

export const revealVocabularyAnswer = async (userId, sessionId) => {
  const session = await getSessionWithQuestions(sessionId, userId);
  if (!session) return null;
  if (session.status !== "active") {
    const error = new Error("This practice session is no longer active.");
    error.statusCode = 409;
    throw error;
  }
  const question = session.questions[session.currentIndex];
  if (!question) return { session: buildSessionSummary(session), answer: null };
  return {
    session: buildSessionSummary(session),
    answer: {
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    },
  };
};

export const answerVocabularyQuestion = async (userId, sessionId, input = {}) => {
  const session = await getSessionWithQuestions(sessionId, userId);
  if (!session) return null;
  if (session.status !== "active") {
    const error = new Error("This practice session is no longer active.");
    error.statusCode = 409;
    throw error;
  }

  const question = session.questions[session.currentIndex];
  if (!question) {
    const error = new Error("No unanswered question remains.");
    error.statusCode = 409;
    throw error;
  }

  const selectedAnswer = String(input.answer || "").trim();
  const skipped = Boolean(input.skipped);
  const selfRatedFailure = question.interaction === "reveal" && input.result === "again";
  const correct =
    !skipped &&
    !selfRatedFailure &&
    validateQuestionAnswer(question, selectedAnswer);
  const responseTimeMs = Math.max(0, Math.min(10 * 60 * 1000, Number(input.responseTimeMs) || 0));
  const result = deriveReviewResult({
    correct,
    requestedResult: input.result,
    responseTimeMs,
  });
  const item = await Vocabulary.findOne({
    _id: question.vocabularyId,
    userId,
  });
  if (!item) {
    const error = new Error("Vocabulary item no longer exists.");
    error.statusCode = 404;
    throw error;
  }

  await applySrsReview(item, {
    result,
    correct,
    responseTimeMs,
    mode: session.mode,
  });
  await VocabularyReviewLog.create({
    userId,
    vocabularyId: item._id,
    sessionId: session._id,
    mode: session.mode,
    questionType: question.questionType,
    result,
    correct,
    responseTimeMs,
    selectedAnswer,
  });

  session.answers.push({
    vocabularyId: item._id,
    questionType: question.questionType,
    selectedAnswer,
    correct,
    skipped,
    result,
    responseTimeMs,
    answeredAt: new Date(),
  });
  if (correct) session.correctAnswers += 1;
  else session.wrongAnswers += 1;
  if (skipped) session.skippedQuestions += 1;
  if (!correct && !session.weakWordsSeen.some((id) => String(id) === String(item._id))) {
    session.weakWordsSeen.push(item._id);
  }
  session.reviewUpdatesApplied += 1;
  session.currentIndex += 1;
  session.averageResponseTime =
    session.answers.reduce((sum, answer) => sum + answer.responseTimeMs, 0) /
    session.answers.length;

  const completed = session.currentIndex >= session.questions.length;
  if (completed) {
    session.status = "completed";
    session.completedAt = new Date();
  }
  await session.save();
  if (completed) await logVocabularyStudySession(session, userId);

  const nextQuestion = completed ? null : session.questions[session.currentIndex];
  const sessionPayload = completed
    ? await buildFullSessionSummary(session, userId)
    : buildSessionSummary(session);
  return {
    correct,
    result,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    nextReviewAt: item.nextReviewAt,
    nextIntervalDays: item.intervalDays,
    confidence: item.confidence,
    session: sessionPayload,
    nextQuestion: nextQuestion ? sanitizeQuestion(nextQuestion) : null,
  };
};

export const finishVocabularySession = async (userId, sessionId) => {
  const session = await getSessionWithQuestions(sessionId, userId);
  if (!session) return null;
  if (session.status === "active") {
    session.status = "completed";
    session.completedAt = new Date();
    session.skippedQuestions += Math.max(0, session.questionCount - session.answers.length);
    await session.save();
  }

  await logVocabularyStudySession(session, userId);
  return buildFullSessionSummary(session, userId);
};
