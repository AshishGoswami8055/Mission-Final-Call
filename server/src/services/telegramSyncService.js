import TelegramChannelMapping from "../models/TelegramChannelMapping.js";
import { importBatchByForumTopics } from "./telegramMappingService.js";
import { getActiveSession } from "./telegramService.js";

let syncInterval = null;
let syncRunning = false;

export const syncChannelMapping = async (mapping) => {
  if (!mapping?.channelId || !mapping.programmeId) {
    return { imported: 0, skipped: 0 };
  }

  const syncTopicIds = Array.isArray(mapping.syncTopicIds)
    ? mapping.syncTopicIds.map(Number).filter(Boolean)
    : [];
  if (!syncTopicIds.length) {
    return { imported: 0, skipped: 0, message: "No subjects selected for auto-sync." };
  }

  const session = await getActiveSession();
  if (!session?.isActive) {
    return { imported: 0, skipped: 0, error: "No Telegram session" };
  }

  const result = await importBatchByForumTopics({
    channelId: mapping.channelId,
    channelTitle: mapping.channelTitle,
    programmeId: mapping.programmeId,
    autoSync: true,
    cleanSync: false,
    topicIds: syncTopicIds,
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
  syncRunning = true;
  try {
    const mappings = await TelegramChannelMapping.find({
      "syncTopicIds.0": { $exists: true },
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
  console.log(`[telegram-sync] Background lesson download enabled (every ${Math.round(intervalMs / 60000)} min)`);
};
