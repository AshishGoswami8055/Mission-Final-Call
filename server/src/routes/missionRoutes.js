import express from "express";
import protect from "../middlewares/authMiddleware.js";
import {
  completeMissionItemHandler,
  completeReading,
  getAnalyticsOverview,
  getIntelligenceReport,
  getMockHistory,
  getReadingToday,
  getTodayMission,
  logSession,
  pauseReading,
  regenerateTodayMission,
  refreshAiBriefing,
  resumeReading,
  startReading,
  submitMockTest,
  updateReadingTarget,
} from "../controllers/missionController.js";

const router = express.Router();

router.use(protect);

router.get("/today", getTodayMission);
router.post("/today/regenerate", regenerateTodayMission);
router.post("/ai-briefing/refresh", refreshAiBriefing);
router.post("/items/complete", completeMissionItemHandler);

router.get("/reading/today", getReadingToday);
router.post("/reading/start", startReading);
router.post("/reading/pause", pauseReading);
router.post("/reading/resume", resumeReading);
router.post("/reading/complete", completeReading);
router.put("/reading/target", updateReadingTarget);

router.post("/mock/submit", submitMockTest);
router.get("/mock/history", getMockHistory);

router.get("/analytics/overview", getAnalyticsOverview);
router.get("/analytics/intelligence", getIntelligenceReport);
router.post("/session/log", logSession);

export default router;
