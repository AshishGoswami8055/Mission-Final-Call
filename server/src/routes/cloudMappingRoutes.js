import express from "express";
import {
  bulkUpsertMappings,
  deleteMapping,
  getCloudinaryUsage,
  listClouds,
  listMappings,
  upsertMapping,
} from "../controllers/cloudMappingController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/clouds", listClouds);
router.get("/usage", getCloudinaryUsage);
router.put("/bulk", bulkUpsertMappings);
router.route("/").get(listMappings).post(upsertMapping);
router.delete("/:subjectId", deleteMapping);

export default router;
