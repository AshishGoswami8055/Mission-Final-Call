import express from "express";
import {
  bulkCreatePapers,
  createPaper,
  deletePaper,
  getPaperById,
  getPapers,
  togglePaperProgress,
  updatePaper,
} from "../controllers/paperController.js";
import protect from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.use(protect);

router.route("/").get(getPapers).post(upload.single("file"), createPaper);
router.post("/bulk", upload.array("files", 100), bulkCreatePapers);
router.get("/:id", getPaperById);
router.post("/:id/progress", togglePaperProgress);
router.route("/:id").put(upload.single("file"), updatePaper).delete(deletePaper);

export default router;
