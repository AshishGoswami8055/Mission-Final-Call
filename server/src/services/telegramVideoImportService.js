import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Subject from "../models/Subject.js";
import SubjectCloudMapping from "../models/SubjectCloudMapping.js";
import { isKnownCloud, getDefaultCloud } from "../config/cloudinary.js";
import {
  safeUnlink,
  uploadVideoToCloudinary,
} from "./cloudinaryUploadService.js";
import { downloadTelegramMediaToFile } from "./telegramService.js";
import { setProgress, completeProgress } from "./uploadProgressBus.js";
import { prepareVideoForCloud, readFileSize } from "./videoCloudPrepService.js";

const resolveCloudForSubject = async (subjectId) => {
  const fallback = getDefaultCloud();
  if (!subjectId) return fallback;
  const mapping = await SubjectCloudMapping.findOne({ subjectId }).lean();
  if (mapping?.cloudType && isKnownCloud(mapping.cloudType)) {
    return mapping.cloudType;
  }
  return fallback;
};

const tempDir = () => path.join(os.tmpdir(), "cds-telegram-video");

const resolveUploadFolders = async (subject) => {
  const row = await Subject.findById(subject._id || subject)
    .populate("programmeId", "folderSlug cdsCycleId name")
    .select("name programmeId");
  const prog = row?.programmeId;
  return {
    subjectName: row?.name || subject.name || "subject",
    courseFolder: prog?.cdsCycleId || "CDS",
    batchFolder: prog?.folderSlug || prog?.name || "Main",
  };
};

const reportProgress = (uploadId, patch) => {
  if (!uploadId) return;
  setProgress(uploadId, patch);
};

const shouldCloudifyTelegramVideos = () =>
  String(process.env.TELEGRAM_VIDEO_CLOUDIFY ?? "1") !== "0";

const telegramStreamFallback = (base, meta) => ({
  ...base,
  sourceType: "telegram",
  videoSourceType: "telegram",
  duration: meta.duration ?? null,
});

const guessVideoExtension = (fileName = "", mimeType = "") => {
  const ext = path.extname(String(fileName)).toLowerCase();
  if (ext) return ext;
  if (/mp4/i.test(mimeType)) return ".mp4";
  if (/webm/i.test(mimeType)) return ".webm";
  if (/quicktime|mov/i.test(mimeType)) return ".mov";
  return ".mp4";
};

/**
 * Download a Telegram video, compress if needed, and upload to Cloudinary for CDN playback.
 * Falls back to live Telegram streaming when Cloudinary is unavailable.
 */
export const buildTelegramVideoContentFields = async ({
  channelId,
  meta,
  subject,
  uploadId = null,
  fileIndex = 0,
  filesTotal = 1,
}) => {
  const base = {
    telegramSource: true,
    telegramChannelId: String(channelId),
    telegramMessageId: Number(meta.messageId),
    telegramFileName: meta.fileName,
    telegramMimeType: meta.mimeType,
    telegramFileSize: meta.size,
  };

  if (!shouldCloudifyTelegramVideos()) {
    return telegramStreamFallback(base, meta);
  }

  const cloudType = await resolveCloudForSubject(subject._id || subject);
  if (!isKnownCloud(cloudType)) {
    return telegramStreamFallback(base, meta);
  }

  const folders = await resolveUploadFolders(subject);
  const ext = guessVideoExtension(meta.fileName, meta.mimeType);
  const tmpPath = path.join(
    tempDir(),
    `${meta.messageId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
  );
  let prepared = null;

  try {
    reportProgress(uploadId, {
      phase: "telegram-download",
      fileIndex,
      filesTotal,
      currentFile: meta.fileName,
      message: `Downloading ${meta.fileName} from Telegram`,
      percent: Math.max(1, Math.round((fileIndex / Math.max(filesTotal, 1)) * 20)),
    });

    await downloadTelegramMediaToFile({
      channelId,
      messageId: meta.messageId,
      destPath: tmpPath,
      onProgress: ({ bytesLoaded, bytesTotal, percent }) => {
        const slice = filesTotal > 0 ? 20 / filesTotal : 20;
        const basePct = (fileIndex / Math.max(filesTotal, 1)) * 20;
        reportProgress(uploadId, {
          phase: "telegram-download",
          fileIndex,
          filesTotal,
          currentFile: meta.fileName,
          bytesLoaded,
          bytesTotal,
          message: `Downloading ${meta.fileName}`,
          percent: Math.min(22, Math.round(basePct + (percent / 100) * slice)),
        });
      },
    });

    prepared = await prepareVideoForCloud({
      sourcePath: tmpPath,
      originalSizeBytes: readFileSize(tmpPath),
      uploadId,
    });

    reportProgress(uploadId, {
      phase: "uploading",
      fileIndex,
      filesTotal,
      currentFile: meta.fileName,
      message: `Uploading ${meta.fileName} to Cloudinary`,
      percent: Math.min(48, Math.round(45 + (fileIndex / Math.max(filesTotal, 1)) * 3)),
      bytesLoaded: 0,
      bytesTotal: readFileSize(prepared.pathToUpload),
    });

    const cloudResult = await uploadVideoToCloudinary({
      absoluteFilePath: prepared.pathToUpload,
      cloudType,
      courseFolder: folders.courseFolder,
      batchFolder: folders.batchFolder,
      subjectName: folders.subjectName,
      titleHint: meta.fileName,
      originalFilename: meta.fileName,
      onProgress: ({ bytesUploaded, bytesTotal, percent, instantaneousBps }) => {
        const slice = filesTotal > 0 ? 50 / filesTotal : 50;
        const basePct = 48 + (fileIndex / Math.max(filesTotal, 1)) * slice;
        reportProgress(uploadId, {
          phase: "uploading",
          fileIndex,
          filesTotal,
          currentFile: meta.fileName,
          bytesLoaded: bytesUploaded,
          bytesTotal,
          bytesPerSecond: instantaneousBps,
          message: `Uploading ${meta.fileName} to Cloudinary`,
          percent: Math.min(98, Math.round(basePct + (percent / 100) * slice)),
        });
      },
    });

    return {
      ...base,
      sourceType: "cloudinary",
      videoSourceType: null,
      videoUrl: cloudResult.secure_url,
      publicId: cloudResult.public_id,
      cloudType,
      duration: Number(cloudResult.duration) || meta.duration || null,
    };
  } catch (error) {
    console.warn(
      `[telegram-video] Cloudinary upload failed for message ${meta.messageId}, using Telegram stream:`,
      error.message
    );
    reportProgress(uploadId, {
      phase: "finalizing",
      fileIndex,
      filesTotal,
      currentFile: meta.fileName,
      message: `Using Telegram stream for ${meta.fileName}`,
    });
    return telegramStreamFallback(base, meta);
  } finally {
    if (prepared?.compressedPath) safeUnlink(prepared.compressedPath);
    safeUnlink(tmpPath);
  }
};

/**
 * Migrate an existing telegram-stream Content row to Cloudinary CDN playback.
 */
export const migrateTelegramVideoContentToCloudinary = async (content, { uploadId = null } = {}) => {
  if (!content || content.type !== "video") {
    throw new Error("Only video content can be migrated to Cloudinary.");
  }
  if (content.sourceType === "cloudinary" && content.videoUrl) {
    return content;
  }
  if (!content.telegramChannelId || !content.telegramMessageId) {
    throw new Error("This video is not linked to a Telegram file.");
  }

  const subject = await Subject.findById(content.subjectId);
  if (!subject) throw new Error("Subject not found for this video.");

  const meta = {
    messageId: content.telegramMessageId,
    fileName: content.telegramFileName || content.title,
    mimeType: content.telegramMimeType || "video/mp4",
    size: content.telegramFileSize || 0,
    duration: content.duration,
  };

  if (uploadId) {
    setProgress(uploadId, {
      phase: "pending",
      message: `Preparing smooth playback for ${content.title}`,
      filesTotal: 1,
      fileIndex: 0,
      percent: 1,
    });
  }

  const fields = await buildTelegramVideoContentFields({
    channelId: content.telegramChannelId,
    meta,
    subject,
    uploadId,
    fileIndex: 0,
    filesTotal: 1,
  });

  if (fields.sourceType !== "cloudinary") {
    throw new Error("Could not upload video to Cloudinary. Check server logs and Cloudinary credentials.");
  }

  content.sourceType = "cloudinary";
  content.videoSourceType = null;
  content.videoUrl = fields.videoUrl;
  content.publicId = fields.publicId;
  content.cloudType = fields.cloudType;
  if (fields.duration) content.duration = fields.duration;
  await content.save();

  if (uploadId) {
    completeProgress(uploadId, {
      message: "Video is now on Cloudinary — smooth playback enabled",
      percent: 100,
      filesTotal: 1,
      fileIndex: 1,
    });
  }

  return content;
};

export const isTelegramVideoCloudifyEnabled = () => shouldCloudifyTelegramVideos();
