import express from "express";
import {
  createSubject,
  deleteSubject,
  getSubjects,
  updateSubject,
} from "../controllers/subjectController.js";
import {
  assertSubjectLocalLibrary,
  getSubjectDownloadPackHandler,
  getSubjectLocalLibraryHandler,
  getSubjectCachedLibraryIdsHandler,
  startSubjectLocalLibraryHandler,
  getSubjectMergedVideoStatusHandler,
  streamSubjectMergedVideoHandler,
  revealSubjectMergedVideoHandler,
  replaceSubjectMergedVideoHandler,
  linkLocalFullCourseHandler,
} from "../controllers/subjectDownloadController.js";
import protect from "../middlewares/authMiddleware.js";
import protectStream from "../middlewares/streamAuthMiddleware.js";
import { uploadMergedVideoReplace } from "../middlewares/mergedVideoUploadMiddleware.js";

const router = express.Router();

router.get("/:id/merged-video/stream", protectStream, streamSubjectMergedVideoHandler);

router.use(protect);
router.get("/:id/download-pack", getSubjectDownloadPackHandler);
router.get("/:id/merged-video", getSubjectMergedVideoStatusHandler);
router.post("/:id/merged-video/reveal", assertSubjectLocalLibrary, revealSubjectMergedVideoHandler);
router.post("/:id/merged-video/replace", assertSubjectLocalLibrary, (req, res, next) => {
  uploadMergedVideoReplace(req, res, (error) => {
    if (error) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "File too large for browser upload (max 8 GB). Use Link from path below for large files like yours."
          : error.message || "Could not upload video file";
      return res.status(400).json({ message });
    }
    next();
  });
}, replaceSubjectMergedVideoHandler);
router.post("/:id/merged-video/link-local", assertSubjectLocalLibrary, linkLocalFullCourseHandler);
router.get("/:id/local-library/cached", assertSubjectLocalLibrary, getSubjectCachedLibraryIdsHandler);
router.get("/:id/local-library", assertSubjectLocalLibrary, getSubjectLocalLibraryHandler);
router.post("/:id/local-library", assertSubjectLocalLibrary, startSubjectLocalLibraryHandler);
router.route("/").get(getSubjects).post(createSubject);
router.route("/:id").put(updateSubject).delete(deleteSubject);

export default router;
