import express from "express";
import {
  assertLocalMediaSettings,
  clearStreamCacheHandler,
  getLocalMediaStorageHandler,
  getStreamCacheHandler,
  updateLocalMediaStorageHandler,
} from "../controllers/mediaStorageController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(assertLocalMediaSettings);
router.get("/local-media", getLocalMediaStorageHandler);
router.put("/local-media", updateLocalMediaStorageHandler);
router.get("/stream-cache", getStreamCacheHandler);
router.delete("/stream-cache", clearStreamCacheHandler);

export default router;
