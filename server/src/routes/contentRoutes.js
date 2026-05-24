import express from "express";
import {
  downloadContentFile,
  assertLocalLibrary,
  bulkUploadContents,
  cloudifyContent,
  createContent,
  deleteContent,
  deleteContentLocalLibrary,
  deleteContentPlaybackCache,
  getContentById,
  getContentLocalLibrary,
  getContentPlaybackCache,
  getContents,
  getLocalLibraryStorage,
  getPlaybackCacheStorage,
  getUploadProgress,
  startContentLocalLibrary,
  startContentPlaybackCache,
  updateContent,
} from "../controllers/contentController.js";
import protect from "../middlewares/authMiddleware.js";
import protectStream from "../middlewares/streamAuthMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.get("/:id/download-file", protectStream, downloadContentFile);
router.use(protect);
router.get("/upload-progress/:uploadId", getUploadProgress);
router.get("/playback-cache/storage", getPlaybackCacheStorage);
router.get("/local-library/storage", assertLocalLibrary, getLocalLibraryStorage);
router.route("/").get(getContents).post(upload.single("file"), createContent);
router.post("/bulk-upload", upload.array("files", 100), bulkUploadContents);
router.get("/:id/playback-cache", getContentPlaybackCache);
router.post("/:id/playback-cache", startContentPlaybackCache);
router.delete("/:id/playback-cache", deleteContentPlaybackCache);
router.get("/:id/local-library", assertLocalLibrary, getContentLocalLibrary);
router.post("/:id/local-library", assertLocalLibrary, startContentLocalLibrary);
router.delete("/:id/local-library", assertLocalLibrary, deleteContentLocalLibrary);
router.post("/:id/cloudify", cloudifyContent);
router.get("/:id", getContentById);
router.route("/:id").put(updateContent).delete(deleteContent);

export default router;
