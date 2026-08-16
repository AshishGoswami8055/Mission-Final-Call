import express from "express";
import multer from "multer";
import {
  assertLocalMediaSettings,
  clearStreamCacheHandler,
  getLocalMediaStorageHandler,
  getStreamCacheHandler,
  getYoutubeCookiesHandler,
  revealStreamCacheFolderHandler,
  revealStreamCacheItemHandler,
  updateLocalMediaStorageHandler,
  uploadYoutubeCookiesHandler,
} from "../controllers/mediaStorageController.js";
import protect from "../middlewares/authMiddleware.js";

const router = express.Router();
const uploadYoutubeCookies = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
});

router.use(protect);
router.use(assertLocalMediaSettings);
router.get("/local-media", getLocalMediaStorageHandler);
router.put("/local-media", updateLocalMediaStorageHandler);
router.get("/youtube-cookies", getYoutubeCookiesHandler);
router.post("/youtube-cookies", uploadYoutubeCookies.single("file"), uploadYoutubeCookiesHandler);
router.get("/stream-cache", getStreamCacheHandler);
router.post("/stream-cache/reveal-folder", revealStreamCacheFolderHandler);
router.post("/stream-cache/:cacheKey/reveal", revealStreamCacheItemHandler);
router.delete("/stream-cache", clearStreamCacheHandler);

export default router;
