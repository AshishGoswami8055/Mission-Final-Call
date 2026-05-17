/**
 * One-shot purge: local uploads + MongoDB media records + Cloudinary assets.
 * Keeps syllabus structure (subjects, chapters, programmes, admins, mappings).
 *
 * Usage (from server/): node scripts/purgeAllMedia.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Content from "../src/models/Content.js";
import Progress from "../src/models/Progress.js";
import Paper from "../src/models/Paper.js";
import PaperAnalysis from "../src/models/PaperAnalysis.js";
import PaperChapterDetail from "../src/models/PaperChapterDetail.js";
import PaperProgress from "../src/models/PaperProgress.js";
import {
  destroyCloudinaryRaw,
  destroyCloudinaryVideo,
} from "../src/services/cloudinaryUploadService.js";
import { reloadCloudRegistry } from "../src/config/cloudinary.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const uploadRoot = path.resolve(__dirname, "..", "..", "uploads");

const removeDirContents = (dir) => {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += removeDirContents(full);
      fs.rmdirSync(full);
    } else {
      fs.unlinkSync(full);
      removed += 1;
    }
  }
  return removed;
};

const purgeCloudinaryForDocs = async (docs, destroyFn, label) => {
  let ok = 0;
  let fail = 0;
  for (const doc of docs) {
    if (!doc.publicId || !doc.cloudType) continue;
    try {
      await destroyFn({ cloudType: doc.cloudType, publicId: doc.publicId });
      ok += 1;
    } catch (err) {
      fail += 1;
      console.warn(`[cloudinary] ${label} ${doc.publicId}: ${err.message}`);
    }
  }
  return { ok, fail };
};

async function main() {
  reloadCloudRegistry();

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set in server/.env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const contents = await Content.find({}).lean();
  const papers = await Paper.find({}).lean();

  console.log(`Found ${contents.length} content record(s), ${papers.length} paper record(s)`);

  const cloudVideos = contents.filter((c) => c.sourceType === "cloudinary" && c.publicId);
  const cloudPapers = papers.filter((p) => p.sourceType === "cloudinary" && p.publicId);

  const v = await purgeCloudinaryForDocs(cloudVideos, destroyCloudinaryVideo, "video");
  const p = await purgeCloudinaryForDocs(cloudPapers, destroyCloudinaryRaw, "pdf");
  console.log(`Cloudinary destroyed: ${v.ok} video(s), ${p.ok} pdf(s) (failures: ${v.fail + p.fail})`);

  const [contentDel, progressDel, paperDel, analysisDel, chapterDetailDel, paperProgressDel] =
    await Promise.all([
      Content.deleteMany({}),
      Progress.deleteMany({}),
      Paper.deleteMany({}),
      PaperAnalysis.deleteMany({}),
      PaperChapterDetail.deleteMany({}),
      PaperProgress.deleteMany({}),
    ]);

  console.log("MongoDB deleted:", {
    contents: contentDel.deletedCount,
    progress: progressDel.deletedCount,
    papers: paperDel.deletedCount,
    paperAnalyses: analysisDel.deletedCount,
    paperChapterDetails: chapterDetailDel.deletedCount,
    paperProgress: paperProgressDel.deletedCount,
  });

  const localFilesRemoved = removeDirContents(uploadRoot);
  console.log(`Local uploads: removed ${localFilesRemoved} file(s) under ${uploadRoot}`);

  await mongoose.disconnect();
  console.log("Done. Subjects, chapters, and programmes were kept.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
