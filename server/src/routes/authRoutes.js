import express from "express";
import {
  loginAdmin,
  me,
  registerAdmin,
  updateOwnPassword,
  youTubeDisconnect,
  youTubeOAuthCallback,
  youTubeStartAuth,
  youTubeStatus,
} from "../controllers/authController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/login", loginAdmin);
router.post("/register", registerAdmin);
router.get("/me", protect, me);
router.patch("/password", protect, updateOwnPassword);

// YouTube OAuth — protected status / start / disconnect.
// `callback` is intentionally public because Google does the redirect.
router.get("/youtube/status", protect, youTubeStatus);
router.get("/youtube/connect", protect, youTubeStartAuth);
router.get("/youtube/callback", youTubeOAuthCallback);
router.delete("/youtube", protect, youTubeDisconnect);

export default router;
