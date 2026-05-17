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
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

router.use(protect);
router.get("/stats", getVocabularyStats);
router.get("/practice", getPracticeVocabulary);
router.post("/import", importUpload.single("file"), importVocabulary);
router.post("/import-text", importVocabularyText);
router.route("/").get(getVocabulary).post(createVocabulary);
router.route("/:id").put(updateVocabulary).delete(deleteVocabulary);
router.post("/:id/review", reviewVocabulary);

export default router;
