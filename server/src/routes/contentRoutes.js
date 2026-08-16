import express from "express";
import {
  downloadContentFile,
  assertLocalLibrary,
  bulkUploadContents,
  cloudifyContent,
  createContent,
  deleteContent,
  deleteContentLocalLibrary,
  replaceContentLocalLibrary,
  streamBrowserPlayableVideo,
  getYoutubePlaybackStatus,
  prepareYoutubePlayback,
  streamYoutubePlayback,
  deleteYoutubePlayback,
  deleteContentPlaybackCache,
  getContentById,
  getContentLocalLibrary,
  getContentPlaybackCache,
  getContentStreamCache,
  streamContentCachePlay,
  getContents,
  getLocalLibraryStorage,
  getPlaybackCacheStorage,
  getUploadProgress,
  startContentLocalLibrary,
  startContentPlaybackCache,
  reorderContent,
  updateContent,
} from "../controllers/contentController.js";
import protect from "../middlewares/authMiddleware.js";
import protectStream from "../middlewares/streamAuthMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";
import { uploadLocalLibraryReplace } from "../middlewares/localLibraryUploadMiddleware.js";

const router = express.Router();

router.get("/:id/download-file", protectStream, downloadContentFile);
router.get("/:id/browser-playable/stream", protectStream, streamBrowserPlayableVideo);
router.get("/:id/youtube-playback/stream", protectStream, streamYoutubePlayback);
router.get("/:id/stream-cache/play", protectStream, streamContentCachePlay);
router.use(protect);
router.get("/upload-progress/:uploadId", getUploadProgress);
router.get("/playback-cache/storage", getPlaybackCacheStorage);
router.get("/local-library/storage", assertLocalLibrary, getLocalLibraryStorage);
router.route("/").get(getContents).post(upload.single("file"), createContent);
router.post("/bulk-upload", upload.array("files", 100), bulkUploadContents);
router.patch("/reorder", reorderContent);
router.get("/:id/playback-cache", getContentPlaybackCache);
router.post("/:id/playback-cache", startContentPlaybackCache);
router.delete("/:id/playback-cache", deleteContentPlaybackCache);
router.get("/:id/youtube-playback", getYoutubePlaybackStatus);
router.post("/:id/youtube-playback", prepareYoutubePlayback);
router.delete("/:id/youtube-playback", deleteYoutubePlayback);
router.get("/:id/local-library", assertLocalLibrary, getContentLocalLibrary);
router.get("/:id/stream-cache", assertLocalLibrary, getContentStreamCache);
router.post("/:id/local-library", assertLocalLibrary, startContentLocalLibrary);
router.post("/:id/local-library/replace", assertLocalLibrary, (req, res, next) => {
  uploadLocalLibraryReplace(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || "Could not upload video file" });
    }
    next();
  });
}, replaceContentLocalLibrary);
router.delete("/:id/local-library", assertLocalLibrary, deleteContentLocalLibrary);
router.post("/:id/cloudify", cloudifyContent);
router.get("/:id", getContentById);
router.route("/:id").put(updateContent).delete(deleteContent);

export default router;
