import dotenv from "dotenv";
import app from "./app.js";
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
import { startTelegramAutoSync } from "./services/telegramSyncService.js";

dotenv.config();
// Build the Cloudinary multi-account registry now that .env is loaded.
reloadCloudRegistry();
const _clouds = listAvailableClouds();
if (_clouds.length) {
  console.log(`[cloudinary] Configured accounts: ${_clouds.join(", ")}`);
} else {
  console.warn(
    "[cloudinary] No Cloudinary accounts configured. Video uploads will fail until you set CLOUDINARY_CLOUD1_* (and optionally CLOUDINARY_CLOUD2_*) in server/.env."
  );
}

const PORT = process.env.PORT || 5000;

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
  // Keep vocabulary uniqueness scoped by type (vocabulary/idiom/one_word).
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

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startTelegramAutoSync(Number(process.env.TELEGRAM_SYNC_INTERVAL_MS) || 15 * 60 * 1000);
  });
};

start();
