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
  startSubjectLocalLibraryHandler,
} from "../controllers/subjectDownloadController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/:id/download-pack", getSubjectDownloadPackHandler);
router.get("/:id/local-library", assertSubjectLocalLibrary, getSubjectLocalLibraryHandler);
router.post("/:id/local-library", assertSubjectLocalLibrary, startSubjectLocalLibraryHandler);
router.route("/").get(getSubjects).post(createSubject);
router.route("/:id").put(updateSubject).delete(deleteSubject);

export default router;
