import express from "express";
import { getChapterProgress, toggleCompleted, toggleSubjectCompleted } from "../controllers/progressController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.post("/toggle/:contentId", toggleCompleted);
router.post("/subject/:subjectId/toggle-all", toggleSubjectCompleted);
router.get("/chapter/:chapterId", getChapterProgress);

export default router;
