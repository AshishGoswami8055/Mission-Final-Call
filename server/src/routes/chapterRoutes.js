import express from "express";
import {
  createChapter,
  deleteChapter,
  getChapters,
  getChapterStats,
  updateChapter,
} from "../controllers/chapterController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/stats", getChapterStats);
router.route("/").get(getChapters).post(createChapter);
router.route("/:id").put(updateChapter).delete(deleteChapter);

export default router;
