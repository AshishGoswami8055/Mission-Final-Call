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
  getSubjectFullVideoPlaylistHandler,
  startSubjectMergedVideoHandler,
  downloadSubjectMergePartsHandler,
  stitchSubjectMergedVideoHandler,
  streamSubjectMergedVideoHandler,
  downloadSubjectMergedVideoHandler,
} from "../controllers/subjectDownloadController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/:id/download-pack", getSubjectDownloadPackHandler);
router.get("/:id/merged-video", getSubjectMergedVideoStatusHandler);
router.get("/:id/full-video/playlist", getSubjectFullVideoPlaylistHandler);
router.post("/:id/merged-video", startSubjectMergedVideoHandler);
router.post("/:id/merged-video/parts", downloadSubjectMergePartsHandler);
router.post("/:id/merged-video/stitch", stitchSubjectMergedVideoHandler);
router.get("/:id/merged-video/stream", streamSubjectMergedVideoHandler);
router.get("/:id/merged-video/download", downloadSubjectMergedVideoHandler);
router.get("/:id/local-library/cached", assertSubjectLocalLibrary, getSubjectCachedLibraryIdsHandler);
router.get("/:id/local-library", assertSubjectLocalLibrary, getSubjectLocalLibraryHandler);
router.post("/:id/local-library", assertSubjectLocalLibrary, startSubjectLocalLibraryHandler);
router.route("/").get(getSubjects).post(createSubject);
router.route("/:id").put(updateSubject).delete(deleteSubject);

export default router;
