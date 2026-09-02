/**
 * Backfill verified video study days for streak recovery.
 *
 * Usage (from server/):
 *   node scripts/backfillVideoStreak.js
 *   node scripts/backfillVideoStreak.js --email admin@example.com --days 4
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";
import StudySession from "../src/models/StudySession.js";
import { addDaysToDateKey, istDayBounds, todayDateKey } from "../src/utils/subjectBuckets.js";
import { buildVideoStreakStatus } from "../src/services/streakService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const args = process.argv.slice(2);
const emailArgIdx = args.indexOf("--email");
const daysArgIdx = args.indexOf("--days");
const emailFilter = emailArgIdx >= 0 ? args[emailArgIdx + 1] : null;
const dayCount = daysArgIdx >= 0 ? Math.max(1, Number(args[daysArgIdx + 1]) || 4) : 4;

/** Minutes per day — yesterday gets 90m (user reported 1.5h), others 60m minimum for streak. */
const minutesForOffset = (daysBeforeToday) => (daysBeforeToday === 1 ? 90 : 60);

const main = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set in server/.env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const adminQuery = emailFilter ? { email: emailFilter.toLowerCase() } : {};
  const admin = await Admin.findOne(adminQuery).sort({ createdAt: 1 }).lean();
  if (!admin) {
    console.error(emailFilter ? `No admin found for ${emailFilter}` : "No admin user found");
    process.exit(1);
  }

  const today = todayDateKey();
  const backfillDays = [];

  for (let offset = dayCount; offset >= 1; offset -= 1) {
    const dateKey = addDaysToDateKey(today, -offset);
    backfillDays.push({ dateKey, minutes: minutesForOffset(offset) });
  }

  console.log(`Backfilling ${dayCount} video days for ${admin.name} <${admin.email}>…`);

  for (const { dateKey, minutes } of backfillDays) {
    const videoId = `manual-backfill:${dateKey}`;
    const { start, end } = istDayBounds(dateKey);
    const startedAt = new Date(start.getTime() + 12 * 60 * 60 * 1000);

    const existing = await StudySession.findOne({
      userId: admin._id,
      type: "video",
      "meta.videoId": videoId,
      startedAt: { $gte: start, $lt: end },
    });

    if (existing) {
      existing.durationMinutes = Math.max(existing.durationMinutes || 0, minutes);
      existing.date = dateKey;
      existing.meta = {
        ...(existing.meta || {}),
        source: "manual-backfill",
        note: "Verified study streak recovery",
        videoId,
      };
      existing.endedAt = new Date(startedAt.getTime() + minutes * 60 * 1000);
      await existing.save();
      console.log(`  updated ${dateKey}: ${existing.durationMinutes} min`);
      continue;
    }

    await StudySession.create({
      userId: admin._id,
      date: dateKey,
      type: "video",
      contentId: null,
      durationMinutes: minutes,
      subjectId: null,
      subjectName: "",
      startedAt,
      endedAt: new Date(startedAt.getTime() + minutes * 60 * 1000),
      meta: {
        title: "Manual streak recovery",
        source: "manual-backfill",
        note: "Verified study streak recovery",
        videoId,
      },
    });
    console.log(`  created ${dateKey}: ${minutes} min`);
  }

  const status = await buildVideoStreakStatus(admin._id);
  console.log("\nStreak status after backfill:");
  console.log(`  streak: ${status.streak} days`);
  console.log(`  todayVideoMinutes: ${status.todayVideoMinutes}`);
  console.log(
    "  recentDays:",
    status.recentDays.map((d) => `${d.date} ${d.minutes}m${d.complete ? " ✓" : ""}`).join(", ")
  );

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
