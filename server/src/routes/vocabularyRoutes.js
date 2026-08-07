import express from "express";
import multer from "multer";
import {
  createVocabulary,
  deleteVocabulary,
  getPracticeVocabulary,
  getVocabulary,
  getVocabularyStats,
  importVocabulary,
  importVocabularyText,
  reviewVocabulary,
  updateVocabulary,
} from "../controllers/vocabularyController.js";
import {
  answerPracticeQuestion,
  commitImport,
  finishPracticeSession,
  getPracticeSession,
  getRootFamilies,
  getVocabularyAnalytics,
  getVocabularyDashboard,
  getWeakWords,
  previewImport,
  revealPracticeAnswer,
  startPracticeSession,
} from "../controllers/vocabularyArenaController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});
const uploadVocabularyFile = (req, res, next) => {
  importUpload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Import file must be 20 MB or smaller." });
    }
    return res.status(400).json({ message: error.message || "Could not read import file." });
  });
};

router.use(protect);
router.get("/dashboard", getVocabularyDashboard);
router.get("/analytics", getVocabularyAnalytics);
router.get("/weak-words", getWeakWords);
router.get("/root-families", getRootFamilies);
router.post("/session/start", startPracticeSession);
router.get("/session/:sessionId", getPracticeSession);
router.post("/session/:sessionId/reveal", revealPracticeAnswer);
router.post("/session/:sessionId/answer", answerPracticeQuestion);
router.post("/session/:sessionId/finish", finishPracticeSession);
router.post("/import-preview", uploadVocabularyFile, previewImport);
router.post("/import-commit", commitImport);
router.get("/stats", getVocabularyStats);
router.get("/practice", getPracticeVocabulary);
router.post("/import", uploadVocabularyFile, importVocabulary);
router.post("/import-text", importVocabularyText);
router.route("/").get(getVocabulary).post(createVocabulary);
router.route("/:id").put(updateVocabulary).delete(deleteVocabulary);
router.post("/:id/review", reviewVocabulary);

export default router;
