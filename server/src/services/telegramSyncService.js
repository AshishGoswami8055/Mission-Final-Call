import TelegramChannelMapping from "../models/TelegramChannelMapping.js";
import Programme from "../models/Programme.js";
import Subject from "../models/Subject.js";
import { filterTopicIdsForSyncWrite } from "./telegramSubjectBlocklist.js";
import { importBatchByForumTopics, repairSubjectTelegramLinks } from "./telegramMappingService.js";
import { importBatchByFlatSubjects } from "./telegramFlatChannelService.js";
import { getActiveSession, getActiveStreamCount } from "./telegramService.js";

let syncInterval = null;
let syncRunning = false;

/** Remove deleted subjects from auto-sync lists (fixes subjects that reappeared before this patch). */
export const pruneOrphanedSyncTopics = async (mapping) => {
  if (!mapping?.programmeId) return mapping;

  const subjects = await Subject.find({
    programmeId: mapping.programmeId,
    $or: [{ telegramTopicId: { $ne: null } }, { telegramSubjectKey: { $ne: null } }],
  }).select("telegramTopicId telegramSubjectKey");

  const activeTopicIds = new Set(
    subjects.map((row) => Number(row.telegramTopicId)).filter(Boolean)
  );
  const activeKeys = new Set(
    subjects.map((row) => String(row.telegramSubjectKey || "")).filter(Boolean)
  );

  const nextTopicIds = (mapping.syncTopicIds || [])
    .map(Number)
    .filter((id) => activeTopicIds.has(id));
  const nextKeys = (mapping.syncSubjectKeys || [])
    .map(String)
    .filter((key) => activeKeys.has(key));

  const removedTopicIds = (mapping.syncTopicIds || [])
    .map(Number)
    .filter((id) => id && !activeTopicIds.has(id));
  const removedKeys = (mapping.syncSubjectKeys || [])
    .map(String)
    .filter((key) => key && !activeKeys.has(key));

  const topicChanged = nextTopicIds.length !== (mapping.syncTopicIds || []).length;
  const keyChanged = nextKeys.length !== (mapping.syncSubjectKeys || []).length;
  if (topicChanged || keyChanged || removedTopicIds.length || removedKeys.length) {
    const update = {
      $set: { syncTopicIds: nextTopicIds, syncSubjectKeys: nextKeys },
    };
    const addToSet = {};
    if (removedTopicIds.length) addToSet.blockedTopicIds = { $each: removedTopicIds };
    if (removedKeys.length) addToSet.blockedSubjectKeys = { $each: removedKeys };
    if (Object.keys(addToSet).length) update.$addToSet = addToSet;

    await TelegramChannelMapping.updateOne({ _id: mapping._id }, update);
    return TelegramChannelMapping.findById(mapping._id);
  }

  return mapping;
};

export const pruneAllOrphanedSyncTopics = async () => {
  const mappings = await TelegramChannelMapping.find({});
  let pruned = 0;
  for (const mapping of mappings) {
    const beforeTopics = (mapping.syncTopicIds || []).length;
    const updated = await pruneOrphanedSyncTopics(mapping);
    const afterTopics = (updated?.syncTopicIds || []).length;
    if (afterTopics !== beforeTopics) pruned += 1;
  }
  if (pruned) {
    console.log(`[telegram-sync] Pruned orphaned sync entries for ${pruned} batch(es)`);
  }
  return { pruned };
};

export const syncChannelMapping = async (mapping) => {
  if (!mapping?.channelId || !mapping.programmeId) {
    return { imported: 0, skipped: 0 };
  }

  mapping = await pruneOrphanedSyncTopics(mapping);

  const existingSubjects = await Subject.find({
    programmeId: mapping.programmeId,
    telegramChannelId: String(mapping.channelId),
    $or: [{ telegramTopicId: { $ne: null } }, { telegramSubjectKey: { $ne: null } }],
  }).select("telegramTopicId telegramSubjectKey");

  let syncTopicIds = existingSubjects
    .map((row) => Number(row.telegramTopicId))
    .filter(Boolean);
  syncTopicIds = await filterTopicIdsForSyncWrite({
    programmeId: mapping.programmeId,
    topicIds: syncTopicIds,
  });

  const syncSubjectKeys = existingSubjects
    .map((row) => String(row.telegramSubjectKey || ""))
    .filter(Boolean);

  if (!syncTopicIds.length && !syncSubjectKeys.length) {
    return { imported: 0, skipped: 0, message: "No active Telegram subjects to sync." };
  }

  const session = await getActiveSession();
  if (!session?.isActive) {
    return { imported: 0, skipped: 0, error: "No Telegram session" };
  }

  const importFn =
    mapping.channelMode === "flat" ? importBatchByFlatSubjects : importBatchByForumTopics;

  const result = await importFn({
    channelId: mapping.channelId,
    channelTitle: mapping.channelTitle,
    programmeId: mapping.programmeId,
    autoSync: true,
    cleanSync: false,
    topicIds: syncTopicIds.length ? syncTopicIds : null,
    existingSubjectsOnly: true,
  });

  return {
    imported: result.created.length,
    skipped: result.skipped.length,
    topicsProcessed: result.topicsProcessed,
    items: result.created,
  };
};

export const syncAllAutoChannels = async () => {
  if (syncRunning) return { skipped: true };
  if (getActiveStreamCount() > 0) {
    console.log("[telegram-sync] Skipped — video playback in progress");
    return { skipped: true, reason: "playback" };
  }
  syncRunning = true;
  try {
    const mappings = await TelegramChannelMapping.find({
      $or: [{ "syncTopicIds.0": { $exists: true } }, { "syncSubjectKeys.0": { $exists: true } }],
    });
    const results = [];
    for (const mapping of mappings) {
      try {
        const result = await syncChannelMapping(mapping);
        results.push({ channelId: mapping.channelId, ...result });
      } catch (error) {
        results.push({ channelId: mapping.channelId, error: error.message });
      }
    }
    return { synced: results.length, results };
  } finally {
    syncRunning = false;
  }
};

export const startTelegramAutoSync = (intervalMs = 15 * 60 * 1000) => {
  if (syncInterval) return;
  syncInterval = setInterval(() => {
    syncAllAutoChannels().catch((err) => {
      console.warn("[telegram-sync]", err.message);
    });
  }, intervalMs);
  console.log(
    `[telegram-sync] Background lesson download scheduled (every ${Math.round(intervalMs / 60000)} min, skips while you watch)`
  );
};

/** Runs after Telegram warm-connect so startup maintenance never blocks video playback. */
export const runTelegramStartupMaintenance = async () => {
  if (process.env.TELEGRAM_AUTO_SYNC === "false") return;

  await pruneAllOrphanedSyncTopics().catch((err) => {
    console.warn("[telegram-sync] Startup prune failed:", err.message);
  });

  const skipRepair =
    process.env.TELEGRAM_STARTUP_REPAIR === "false" ||
    (process.env.NODE_ENV !== "production" && process.env.TELEGRAM_STARTUP_REPAIR !== "true");

  if (!skipRepair) {
    const programmes = await Programme.find({}).select("_id");
    let repaired = 0;
    for (const programme of programmes) {
      if (getActiveStreamCount() > 0) {
        console.log("[telegram-sync] Startup repair paused — playback in progress");
        break;
      }
      const result = await repairSubjectTelegramLinks({ programmeId: programme._id }).catch(() => ({
        repaired: 0,
      }));
      repaired += result.repaired || 0;
    }
    if (repaired) {
      console.log(`[telegram] Repaired stale topic links for ${repaired} subject(s)`);
    }
  }

  startTelegramAutoSync(Number(process.env.TELEGRAM_SYNC_INTERVAL_MS) || 15 * 60 * 1000);
};
