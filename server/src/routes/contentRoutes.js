import express from "express";
import {
  bulkUploadContents,
  createContent,
  deleteContent,
  getContentById,
  getContents,
  getUploadProgress,
  updateContent,
} from "../controllers/contentController.js";
import protect from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/upload-progress/:uploadId", getUploadProgress);
router.route("/").get(getContents).post(upload.single("file"), createContent);
router.post("/bulk-upload", upload.array("files", 100), bulkUploadContents);
router.get("/:id", getContentById);
router.route("/:id").put(updateContent).delete(deleteContent);

export default router;
