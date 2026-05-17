import express from "express";
import {
  createProgramme,
  deleteProgramme,
  getProgrammes,
  updateProgramme,
} from "../controllers/programmeController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.route("/").get(getProgrammes).post(createProgramme);
router.route("/:id").put(updateProgramme).delete(deleteProgramme);

export default router;
