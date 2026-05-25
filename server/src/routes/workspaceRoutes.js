import express from "express";
import { getPublicWorkspaceStats } from "../controllers/workspaceController.js";

const router = express.Router();

router.get("/public-stats", getPublicWorkspaceStats);

export default router;
