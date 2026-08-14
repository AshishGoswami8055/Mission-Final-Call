import express from "express";
import protect from "../middlewares/authMiddleware.js";
import protectStream from "../middlewares/streamAuthMiddleware.js";
import {
  telegramChannelMappings,
  telegramChannels,
  telegramCleanupImport,
  telegramForumPreview,
  telegramTopicMedia,
  telegramImport,
  telegramImportBatch,
  telegramLogin,
  telegramLogout,
  telegramMessages,
  telegramPreviewBatch,
  telegramResetSession,
  telegramSessionStatus,
  telegramStream,
  telegramThumbnail,
  telegramSyncAll,
  telegramSyncChannel,
  telegramBatchUpdates,
  telegramUpdateBatch,
  telegramUpdateSubject,
  telegramCancelProgress,
  telegramVerifyOtp,
  telegramVerifyPassword,
} from "../controllers/telegramController.js";

const router = express.Router();

router.post("/login", protect, telegramLogin);
router.post("/verify-otp", protect, telegramVerifyOtp);
router.post("/verify-password", protect, telegramVerifyPassword);
router.get("/session", protect, telegramSessionStatus);
router.post("/logout", protect, telegramLogout);
router.post("/reset-session", protect, telegramResetSession);
router.get("/channels", protect, telegramChannels);
router.get("/messages/:channelId", protect, telegramMessages);
router.get("/forum-preview", protect, telegramForumPreview);
router.get("/topic-media", protect, telegramTopicMedia);
router.post("/cleanup-import", protect, telegramCleanupImport);
router.get("/preview-batch", protect, telegramPreviewBatch);
router.get("/mappings", protect, telegramChannelMappings);
router.post("/import", protect, telegramImport);
router.post("/import-batch", protect, telegramImportBatch);
router.post("/sync/:channelId", protect, telegramSyncChannel);
router.post("/sync-all", protect, telegramSyncAll);
router.get("/batch-updates", protect, telegramBatchUpdates);
router.post("/update-subject", protect, telegramUpdateSubject);
router.post("/update-batch", protect, telegramUpdateBatch);
router.post("/progress/:uploadId/cancel", protect, telegramCancelProgress);
router.get("/stream/:messageId", protectStream, telegramStream);
router.get("/thumbnail/:messageId", protectStream, telegramThumbnail);

export default router;
