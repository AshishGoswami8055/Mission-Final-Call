import express from "express";
import { getPublicWorkspaceStats, getWorkspaceCapabilities } from "../controllers/workspaceController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/public-stats", getPublicWorkspaceStats);
router.get("/capabilities", protect, getWorkspaceCapabilities);

export default router;
