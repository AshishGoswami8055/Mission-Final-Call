import {
  getRootFamiliesData,
  getVocabularyAnalyticsData,
  getVocabularyDashboardData,
  getWeakVocabularyItems,
} from "../services/vocabularyArenaService.js";
import {
  answerVocabularyQuestion,
  finishVocabularySession,
  getVocabularySession,
  revealVocabularyAnswer,
  startVocabularySession,
} from "../services/vocabularySessionService.js";
import {
  commitVocabularyImport,
  parseVocabularyImportSource,
  previewVocabularyImport,
} from "../services/vocabularyImportService.js";

const handleServiceError = (error, res) => {
  const status =
    Number(error?.statusCode) ||
    (error?.name === "CastError" || error?.name === "ValidationError" ? 400 : 500);
  return res.status(status).json({
    message: error?.message || "Vocabulary Arena request failed.",
  });
};

export const getVocabularyDashboard = async (req, res) => {
  try {
    res.json(await getVocabularyDashboardData(req.user._id));
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const getWeakWords = async (req, res) => {
  try {
    const items = await getWeakVocabularyItems(req.user._id, {
      type: req.query.type,
      limit: req.query.limit,
    });
    res.json({ items, total: items.length });
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const getRootFamilies = async (req, res) => {
  try {
    const families = await getRootFamiliesData(req.user._id, {
      search: req.query.search,
      limit: req.query.limit,
    });
    res.json({ families, total: families.length });
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const getVocabularyAnalytics = async (req, res) => {
  try {
    res.json(await getVocabularyAnalyticsData(req.user._id));
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const startPracticeSession = async (req, res) => {
  try {
    const data = await startVocabularySession(req.user._id, req.body || {});
    res.status(201).json(data);
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const getPracticeSession = async (req, res) => {
  try {
    const data = await getVocabularySession(req.user._id, req.params.sessionId);
    if (!data) return res.status(404).json({ message: "Practice session not found." });
    res.json(data);
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const revealPracticeAnswer = async (req, res) => {
  try {
    const data = await revealVocabularyAnswer(req.user._id, req.params.sessionId);
    if (!data) return res.status(404).json({ message: "Practice session not found." });
    res.json(data);
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const answerPracticeQuestion = async (req, res) => {
  try {
    const data = await answerVocabularyQuestion(
      req.user._id,
      req.params.sessionId,
      req.body || {}
    );
    if (!data) return res.status(404).json({ message: "Practice session not found." });
    res.json(data);
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const finishPracticeSession = async (req, res) => {
  try {
    const data = await finishVocabularySession(req.user._id, req.params.sessionId);
    if (!data) return res.status(404).json({ message: "Practice session not found." });
    res.json({ session: data });
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const previewImport = async (req, res) => {
  try {
    const type = req.body.type || req.query.type || "vocabulary";
    const rawRows = await parseVocabularyImportSource({
      buffer: req.file?.buffer || null,
      mimeType: req.file?.mimetype || "",
      fileName: req.file?.originalname || "",
      text: req.body.text || "",
      type,
    });
    if (!rawRows.length) {
      return res.status(400).json({ message: "No vocabulary rows could be detected." });
    }
    res.json(await previewVocabularyImport({ userId: req.user._id, rawRows, type }));
  } catch (error) {
    handleServiceError(error, res);
  }
};

export const commitImport = async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ message: "No valid preview rows were supplied." });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ message: "Import at most 1,000 rows per batch." });
    }
    const result = await commitVocabularyImport({
      userId: req.user._id,
      rows,
      type: req.body.type || "vocabulary",
    });
    res.status(201).json({ message: "Vocabulary import completed.", ...result });
  } catch (error) {
    handleServiceError(error, res);
  }
};
