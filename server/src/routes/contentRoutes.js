import express from "express";
import {
  bulkUploadContents,
  cloudifyContent,
  createContent,
  deleteContent,
  deleteContentPlaybackCache,
  getContentById,
  getContentPlaybackCache,
  getContents,
  getPlaybackCacheStorage,
  getUploadProgress,
  startContentPlaybackCache,
  updateContent,
} from "../controllers/contentController.js";
import protect from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/upload-progress/:uploadId", getUploadProgress);
router.get("/playback-cache/storage", getPlaybackCacheStorage);
router.route("/").get(getContents).post(upload.single("file"), createContent);
router.post("/bulk-upload", upload.array("files", 100), bulkUploadContents);
router.get("/:id/playback-cache", getContentPlaybackCache);
router.post("/:id/playback-cache", startContentPlaybackCache);
router.delete("/:id/playback-cache", deleteContentPlaybackCache);
router.post("/:id/cloudify", cloudifyContent);
router.get("/:id", getContentById);
router.route("/:id").put(updateContent).delete(deleteContent);

export default router;
