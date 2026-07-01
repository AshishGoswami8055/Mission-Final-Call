import os from "node:os";
import dotenv from "dotenv";
import app from "./app.js";
import dns from "node:dns/promises"
dns.setServers(["8.8.8.8","1.1.1.1"]);
import connectDB from "./config/db.js";
import {
  listAvailableClouds,
  reloadCloudRegistry,
} from "./config/cloudinary.js";
import { ensureDefaultAdmin } from "./controllers/authController.js";
import Subject from "./models/Subject.js";
import Vocabulary from "./models/Vocabulary.js";
import { migrateProgrammesAndSubjects } from "./services/programmeMigrationService.js";
import { cleanupBrokenYoutubeTempFiles, organizeContentUploadsBySubject } from "./services/uploadOrganizationService.js";
import { organizePaperUploadsByYear } from "./services/paperOrganizationService.js";
import { startTelegramAutoSync, pruneAllOrphanedSyncTopics } from "./services/telegramSyncService.js";
import { repairSubjectTelegramLinks } from "./services/telegramMappingService.js";
import Programme from "./models/Programme.js";
import TelegramSession from "./models/TelegramSession.js";
import { getTelegramDeploymentKey } from "./services/telegramService.js";

dotenv.config();
reloadCloudRegistry();
const _clouds = listAvailableClouds();
if (_clouds.length) {
  console.log(`[cloudinary] Configured accounts: ${_clouds.join(", ")}`);
} else {
  console.warn(
    "[cloudinary] No Cloudinary accounts configured. Video uploads will fail until you set CLOUDINARY_CLOUD1_* (and optionally CLOUDINARY_CLOUD2_*) in server/.env."
  );
}

const PORT = Number(process.env.PORT) || 5000;
const HOST = String(process.env.HOST || "0.0.0.0").trim();

const logStartupNetwork = () => {
  console.log(`[server] Listening on ${HOST}:${PORT}`);
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const net of entries || []) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`  http://${net.address}:${PORT}/api/health  (${name})`);
      }
    }
  }
  const publicApiUrl = String(process.env.PUBLIC_API_URL || "").trim();
  if (publicApiUrl) {
    console.log(`[server] Public URL: ${publicApiUrl}`);
  }
};

const start = async () => {
  await connectDB();
  await Subject.collection.dropIndex("name_1").catch(() => {});
  await Subject.updateMany(
    { $or: [{ courseId: { $exists: false } }, { courseId: null }, { courseId: "" }] },
    { $set: { courseId: "cds-2-2026" } }
  );
  await Subject.updateMany({ courseId: "nda-2026" }, { $set: { courseId: "cds-2-2026" } });
  const progMig = await migrateProgrammesAndSubjects();
  if (progMig.createdProgrammes || progMig.updatedSubjects) {
    console.log(
      `[programmes] ensured default coaching folders: newProgrammes=${progMig.createdProgrammes}, subjectsLinked=${progMig.updatedSubjects}`
    );
  }
  await Vocabulary.collection.dropIndex("userId_1_word_1").catch(() => {});
  await Vocabulary.syncIndexes();
  await ensureDefaultAdmin();
  const ytTempCleanup = await cleanupBrokenYoutubeTempFiles();
  if (ytTempCleanup.removed) {
    console.log(`[uploads] cleaned broken yt temp files: removed=${ytTempCleanup.removed}`);
  }
  const migration = await organizeContentUploadsBySubject();
  if (
    migration.moved ||
    migration.updated ||
    migration.missing ||
    migration.movedLegacyFiles ||
    migration.removedLegacyDirs
  ) {
    console.log(
      `[uploads] organized content files: scanned=${migration.scanned}, moved=${migration.moved}, updated=${migration.updated}, missing=${migration.missing}, skipped=${migration.skipped}, movedLegacyFiles=${migration.movedLegacyFiles || 0}, removedLegacyDirs=${migration.removedLegacyDirs || 0}`
    );
  }
  const paperMigration = await organizePaperUploadsByYear();
  if (paperMigration.moved || paperMigration.updated || paperMigration.missing || paperMigration.removedLegacyDirs) {
    console.log(
      `[uploads] organized PYQ papers: scanned=${paperMigration.scanned}, moved=${paperMigration.moved}, updated=${paperMigration.updated}, missing=${paperMigration.missing}, skipped=${paperMigration.skipped}, removedLegacyDirs=${paperMigration.removedLegacyDirs || 0}`
    );
  }

  const legacySessions = await TelegramSession.updateMany(
    {
      isActive: true,
      $or: [{ deploymentKey: { $exists: false } }, { deploymentKey: null }, { deploymentKey: "" }],
    },
    { $set: { isActive: false } }
  );
  if (legacySessions.modifiedCount) {
    console.log(
      `[telegram] Deactivated ${legacySessions.modifiedCount} old shared session(s). Log in to Telegram again on this server (${getTelegramDeploymentKey()}).`
    );
  }

  app.listen(PORT, HOST, async () => {
    logStartupNetwork();
    console.log(`[server] Ready on ${HOST}:${PORT}`);
    if (process.env.TELEGRAM_AUTO_SYNC !== "false") {
      await pruneAllOrphanedSyncTopics().catch((err) => {
        console.warn("[telegram-sync] Startup prune failed:", err.message);
      });
      const programmes = await Programme.find({}).select("_id");
      let repaired = 0;
      for (const programme of programmes) {
        const result = await repairSubjectTelegramLinks({ programmeId: programme._id }).catch(() => ({
          repaired: 0,
        }));
        repaired += result.repaired || 0;
      }
      if (repaired) {
        console.log(`[telegram] Repaired stale topic links for ${repaired} subject(s)`);
      }
      startTelegramAutoSync(Number(process.env.TELEGRAM_SYNC_INTERVAL_MS) || 15 * 60 * 1000);
    }
  });
};

start();
