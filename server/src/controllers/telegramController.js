import mongoose from "mongoose";
import Chapter from "../models/Chapter.js";
import Content from "../models/Content.js";
import Subject from "../models/Subject.js";
import {
  cleanupChannelImport,
  fetchChannelMapping,
  fetchForumTopicsPreview,
  getImportedContentMap,
  getProgrammeSubjectUpdates,
  importBatchByForumTopics,
  importSelectedForumMessages,
  importTelegramMessages,
  listChannelMappings,
  updateProgrammeSubjects,
  upsertChannelMapping,
} from "../services/telegramMappingService.js";
import {
  fetchAllChannelMedia,
  fetchForumTopicsForChannel,
  fetchTelegramChannels,
  fetchTelegramMessages,
  getActiveSession,
  getTelegramMessageMedia,
  logoutTelegram,
  startTelegramLogin,
  streamTelegramMedia,
  verifyTelegramOtp,
  verifyTelegramPassword,
} from "../services/telegramService.js";
import { syncAllAutoChannels, syncChannelMapping } from "../services/telegramSyncService.js";

export const telegramLogin = async (req, res) => {
  try {
    const { phone } = req.body;
    const result = await startTelegramLogin(phone);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Telegram login failed" });
  }
};

export const telegramVerifyOtp = async (req, res) => {
  try {
    const { phone, code } = req.body;
    const result = await verifyTelegramOtp({ phone, code });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "OTP verification failed" });
  }
};

export const telegramVerifyPassword = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const result = await verifyTelegramPassword({ phone, password });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "2FA verification failed" });
  }
};

export const telegramSessionStatus = async (req, res) => {
  try {
    const session = await getActiveSession();
    res.json({
      connected: Boolean(session?.isActive),
      phone: session?.phone || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read Telegram session" });
  }
};

export const telegramLogout = async (req, res) => {
  try {
    await logoutTelegram();
    res.json({ loggedOut: true });
  } catch (error) {
    res.status(500).json({ message: error.message || "Logout failed" });
  }
};

export const telegramChannels = async (req, res) => {
  try {
    const { programmeId } = req.query;
    const channels = await fetchTelegramChannels();
    let mappings = [];
    if (programmeId && mongoose.Types.ObjectId.isValid(programmeId)) {
      mappings = await listChannelMappings(programmeId);
    }
    const mappingByChannel = new Map(mappings.map((m) => [m.channelId, m]));
    res.json({
      channels: channels.map((ch) => ({
        ...ch,
        mapping: mappingByChannel.get(ch.id) || null,
      })),
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not fetch channels" });
  }
};

export const telegramMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { page, limit, search, mediaType, importStatus, sort, dateFrom, dateTo, minSize, maxSize } =
      req.query;

    const allIds = [];
    const preview = await fetchAllChannelMedia({ channelId, maxMessages: 500 });
    preview.forEach((m) => allIds.push(m.messageId));
    const importedMap = await getImportedContentMap(channelId, allIds);

    const result = await fetchTelegramMessages({
      channelId,
      page,
      limit,
      search,
      mediaType,
      importStatus,
      sort,
      dateFrom,
      dateTo,
      minSize,
      maxSize,
      importedMap,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not fetch messages" });
  }
};

export const telegramStream = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { channelId } = req.query;

    if (!channelId) {
      return res.status(400).json({ message: "channelId query parameter is required." });
    }

    await streamTelegramMedia({ channelId, messageId, req, res });
  } catch (error) {
    if (!res.headersSent) {
      res.status(400).json({ message: error.message || "Stream failed" });
    }
  }
};

export const telegramImport = async (req, res) => {
  try {
    const { channelId, messageIds, subjectId, chapterId } = req.body;

    if (!channelId || !Array.isArray(messageIds) || !messageIds.length) {
      return res.status(400).json({ message: "channelId and messageIds are required." });
    }
    if (!subjectId || !chapterId) {
      return res.status(400).json({ message: "subjectId and chapterId are required." });
    }
    if (!mongoose.Types.ObjectId.isValid(subjectId) || !mongoose.Types.ObjectId.isValid(chapterId)) {
      return res.status(400).json({ message: "Invalid subjectId or chapterId." });
    }

    const subject = await Subject.findById(subjectId);
    const chapter = await Chapter.findOne({ _id: chapterId, subjectId });
    if (!subject || !chapter) {
      return res.status(404).json({ message: "Subject or chapter not found." });
    }

    const messages = [];
    for (const rawId of messageIds) {
      const messageId = Number(rawId);
      if (!messageId) continue;
      try {
        const { meta } = await getTelegramMessageMedia({ channelId, messageId });
        messages.push(meta);
      } catch (err) {
        // skip invalid
      }
    }

    const result = await importTelegramMessages({
      channelId,
      programmeId: subject.programmeId,
      messages,
      createMissingSubjects: false,
      autoCreateChapters: false,
      defaultSubjectId: subjectId,
      defaultChapterName: chapter.chapterName,
    });

    res.status(201).json({
      imported: result.created.length,
      skipped: result.skipped.length,
      items: result.created,
      skippedItems: result.skipped,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Import failed" });
  }
};

export const telegramImportBatch = async (req, res) => {
  try {
    const {
      channelId,
      channelTitle,
      programmeId,
      messageIds,
      topicIds,
      importAll = false,
      autoSync = true,
      cleanSync = false,
      useForumTopics = true,
      uploadId = null,
      selectedItems = null,
      pruneUnselectedTopics = false,
    } = req.body;

    const hasSelectedItems = Array.isArray(selectedItems) && selectedItems.length > 0;
    const hasTopicFilter = Array.isArray(topicIds) && topicIds.length > 0;

    if (!channelId || !programmeId) {
      return res.status(400).json({ message: "channelId and programmeId are required." });
    }
    if (!mongoose.Types.ObjectId.isValid(programmeId)) {
      return res.status(400).json({ message: "Invalid programmeId." });
    }

    if (hasSelectedItems && useForumTopics) {
      const result = await importSelectedForumMessages({
        channelId,
        channelTitle,
        programmeId,
        selectedItems,
        autoSync,
        uploadId,
      });
      return res.status(201).json({
        imported: result.created.length,
        skipped: result.skipped.length,
        topicsProcessed: result.topicsProcessed,
        mode: "forum_selected_files",
        items: result.created,
        skippedItems: result.skipped,
        mapping: result.mapping,
      });
    }

    if (useForumTopics && (importAll || hasTopicFilter)) {
      let topics = [];
      try {
        topics = await fetchForumTopicsForChannel(channelId);
      } catch {
        topics = [];
      }

      const flatVirtualTopicIds =
        hasTopicFilter && topicIds.every((id) => Number(id) >= 900_000_000);
      const useForumImport = topics.length > 0 && !flatVirtualTopicIds;

      if (useForumImport) {
        const result = await importBatchByForumTopics({
          channelId,
          channelTitle,
          programmeId,
          autoSync,
          cleanSync: importAll ? cleanSync : false,
          topicIds: hasTopicFilter ? topicIds : null,
          uploadId,
          pruneUnselectedTopics: hasTopicFilter && !importAll && pruneUnselectedTopics !== false,
        });
        return res.status(201).json({
          imported: result.created.length,
          skipped: result.skipped.length,
          topicsProcessed: result.topicsProcessed,
          mode: "forum_topics",
          items: result.created,
          skippedItems: result.skipped,
          mapping: result.mapping,
          pruned: result.pruned,
        });
      }

      const { importBatchByFlatSubjects } = await import(
        "../services/telegramFlatChannelService.js"
      );
      const result = await importBatchByFlatSubjects({
        channelId,
        channelTitle,
        programmeId,
        autoSync,
        topicIds: hasTopicFilter ? topicIds : null,
        uploadId,
      });
      return res.status(201).json({
        imported: result.created.length,
        skipped: result.skipped.length,
        topicsProcessed: result.topicsProcessed,
        mode: "flat_subjects",
        items: result.created,
        skippedItems: result.skipped,
        mapping: result.mapping,
      });
    }

    let messages = [];
    if (importAll) {
      messages = await fetchAllChannelMedia({ channelId });
    } else if (Array.isArray(messageIds) && messageIds.length) {
      for (const rawId of messageIds) {
        const messageId = Number(rawId);
        if (!messageId) continue;
        try {
          const { meta } = await getTelegramMessageMedia({ channelId, messageId });
          messages.push(meta);
        } catch {
          // skip
        }
      }
    } else {
      return res.status(400).json({ message: "Provide messageIds or set importAll=true." });
    }

    const result = await importTelegramMessages({
      channelId,
      channelTitle,
      programmeId,
      messages,
      createMissingSubjects: true,
      autoCreateChapters: true,
      uploadId,
    });

    const maxId = Math.max(result.maxMessageId || 0, ...messages.map((m) => m.messageId));
    const mapping = await upsertChannelMapping({
      channelId,
      channelTitle,
      programmeId,
      autoSync,
      lastSyncedMessageId: maxId,
      importedCount: result.created.length,
    });

    res.status(201).json({
      imported: result.created.length,
      skipped: result.skipped.length,
      createdSubjects: result.createdSubjects?.length || 0,
      items: result.created,
      skippedItems: result.skipped,
      mapping,
    });
  } catch (error) {
    const uploadId = req.body?.uploadId;
    if (uploadId) {
      const { failProgress } = await import("../services/uploadProgressBus.js");
      failProgress(uploadId, error.message || "Batch import failed");
    }
    res.status(400).json({ message: error.message || "Batch import failed" });
  }
};

export const telegramSyncChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { programmeId, topicIds } = req.body;
    if (!programmeId) {
      return res.status(400).json({ message: "programmeId is required." });
    }

    let mapping = await fetchChannelMapping({ channelId, programmeId });
    if (!mapping) {
      return res.status(404).json({ message: "Channel mapping not found. Import batch first." });
    }

    if (Array.isArray(topicIds) && topicIds.length) {
      mapping = await upsertChannelMapping({
        channelId,
        channelTitle: mapping.channelTitle,
        programmeId,
        autoSync: mapping.autoSync,
        syncTopicIds: topicIds,
        replaceSyncTopicIds: true,
      });
    }

    const result = await syncChannelMapping(mapping);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Sync failed" });
  }
};

export const telegramSyncAll = async (req, res) => {
  try {
    const result = await syncAllAutoChannels();
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Sync failed" });
  }
};

export const telegramChannelMappings = async (req, res) => {
  try {
    const { programmeId } = req.query;
    if (!programmeId) {
      return res.status(400).json({ message: "programmeId is required." });
    }
    const mappings = await listChannelMappings(programmeId);
    res.json({ mappings });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not load mappings" });
  }
};

export const telegramBatchUpdates = async (req, res) => {
  try {
    const { programmeId } = req.query;
    if (!programmeId || !mongoose.Types.ObjectId.isValid(programmeId)) {
      return res.status(400).json({ message: "programmeId is required." });
    }
    const result = await getProgrammeSubjectUpdates({ programmeId });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not check updates" });
  }
};

export const telegramUpdateSubject = async (req, res) => {
  try {
    const { programmeId, subjectId } = req.body;
    if (!programmeId || !mongoose.Types.ObjectId.isValid(programmeId)) {
      return res.status(400).json({ message: "programmeId is required." });
    }
    if (!subjectId || !mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ message: "subjectId is required." });
    }
    const result = await updateProgrammeSubjects({ programmeId, subjectId });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Subject update failed" });
  }
};

export const telegramUpdateBatch = async (req, res) => {
  try {
    const { programmeId } = req.body;
    if (!programmeId || !mongoose.Types.ObjectId.isValid(programmeId)) {
      return res.status(400).json({ message: "programmeId is required." });
    }
    const result = await updateProgrammeSubjects({ programmeId, allWithUpdates: true });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Batch update failed" });
  }
};

export const telegramForumPreview = async (req, res) => {
  try {
    const { channelId, programmeId } = req.query;
    if (!channelId) {
      return res.status(400).json({ message: "channelId is required." });
    }
    const preview = await fetchForumTopicsPreview({ channelId });
    let mapping = null;
    if (programmeId && mongoose.Types.ObjectId.isValid(programmeId)) {
      mapping = await fetchChannelMapping({ channelId, programmeId });
    }
    res.json({
      ...preview,
      syncTopicIds: mapping?.syncTopicIds || [],
      syncSubjectKeys: mapping?.syncSubjectKeys || [],
      channelMode: preview.channelMode || mapping?.channelMode || (preview.isForum ? "forum" : "flat"),
      autoSyncEnabled: mapping?.autoSync ?? false,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Preview failed" });
  }
};

export const telegramCleanupImport = async (req, res) => {
  try {
    const { channelId, programmeId } = req.body;
    if (!channelId || !programmeId) {
      return res.status(400).json({ message: "channelId and programmeId are required." });
    }
    const result = await cleanupChannelImport({ programmeId, channelId });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message || "Cleanup failed" });
  }
};

export const telegramPreviewBatch = async (req, res) => {
  try {
    const { channelId, programmeId } = req.query;
    if (!channelId || !programmeId) {
      return res.status(400).json({ message: "channelId and programmeId are required." });
    }

    const messages = await fetchAllChannelMedia({ channelId });
    const importedMap = await getImportedContentMap(
      channelId,
      messages.map((m) => m.messageId)
    );
    const subjects = await Subject.find({ programmeId });

    const preview = messages.map((meta) => {
      const imported = importedMap.get(meta.messageId);
      return {
        ...meta,
        imported: Boolean(imported),
        contentId: imported?.contentId || null,
      };
    });

    res.json({
      total: preview.length,
      importedCount: preview.filter((p) => p.imported).length,
      newCount: preview.filter((p) => !p.imported).length,
      videoCount: preview.filter((p) => p.mediaType === "video").length,
      pdfCount: preview.filter((p) => p.mediaType === "pdf").length,
      items: preview,
      subjectCount: subjects.length,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Preview failed" });
  }
};
