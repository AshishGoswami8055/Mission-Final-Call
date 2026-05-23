import express from "express";
import protect from "../middlewares/authMiddleware.js";
import protectStream from "../middlewares/streamAuthMiddleware.js";
import {
  telegramChannelMappings,
  telegramChannels,
  telegramCleanupImport,
  telegramForumPreview,
  telegramImport,
  telegramImportBatch,
  telegramLogin,
  telegramLogout,
  telegramMessages,
  telegramPreviewBatch,
  telegramSessionStatus,
  telegramStream,
  telegramSyncAll,
  telegramSyncChannel,
  telegramBatchUpdates,
  telegramUpdateBatch,
  telegramUpdateSubject,
  telegramVerifyOtp,
  telegramVerifyPassword,
} from "../controllers/telegramController.js";

const router = express.Router();

router.post("/login", protect, telegramLogin);
router.post("/verify-otp", protect, telegramVerifyOtp);
router.post("/verify-password", protect, telegramVerifyPassword);
router.get("/session", protect, telegramSessionStatus);
router.post("/logout", protect, telegramLogout);
router.get("/channels", protect, telegramChannels);
router.get("/messages/:channelId", protect, telegramMessages);
router.get("/forum-preview", protect, telegramForumPreview);
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
router.get("/stream/:messageId", protectStream, telegramStream);

export default router;
