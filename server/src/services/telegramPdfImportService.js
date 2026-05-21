import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Subject from "../models/Subject.js";
import SubjectCloudMapping from "../models/SubjectCloudMapping.js";
import { isKnownCloud, getDefaultCloud } from "../config/cloudinary.js";
import {
  safeUnlink,
  uploadContentPdfToCloudinary,
} from "./cloudinaryUploadService.js";
import { downloadTelegramDocumentToFile } from "./telegramService.js";
import { setProgress } from "./uploadProgressBus.js";

const resolveCloudForSubject = async (subjectId) => {
  const fallback = getDefaultCloud();
  if (!subjectId) return fallback;
  const mapping = await SubjectCloudMapping.findOne({ subjectId }).lean();
  if (mapping?.cloudType && isKnownCloud(mapping.cloudType)) {
    return mapping.cloudType;
  }
  return fallback;
};

const tempDir = () => path.join(os.tmpdir(), "cds-telegram-pdf");

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

/**
 * Download a Telegram PDF and upload to Cloudinary.
 * Falls back to telegram streaming metadata when Cloudinary is unavailable.
 */
export const buildTelegramPdfContentFields = async ({
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

  const cloudType = await resolveCloudForSubject(subject._id || subject);
  if (!isKnownCloud(cloudType)) {
    return { ...base, sourceType: "telegram" };
  }

  const folders = await resolveUploadFolders(subject);
  const tmpPath = path.join(
    tempDir(),
    `${meta.messageId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`
  );

  try {
    reportProgress(uploadId, {
      phase: "telegram-download",
      fileIndex,
      filesTotal,
      currentFile: meta.fileName,
      message: `Downloading ${meta.fileName} from Telegram`,
      percent: Math.max(1, Math.round((fileIndex / Math.max(filesTotal, 1)) * 30)),
    });

    await downloadTelegramDocumentToFile({
      channelId,
      messageId: meta.messageId,
      destPath: tmpPath,
      onProgress: ({ bytesLoaded, bytesTotal, percent }) => {
        const slice = filesTotal > 0 ? 30 / filesTotal : 30;
        const basePct = (fileIndex / Math.max(filesTotal, 1)) * 30;
        reportProgress(uploadId, {
          phase: "telegram-download",
          fileIndex,
          filesTotal,
          currentFile: meta.fileName,
          bytesLoaded,
          bytesTotal,
          message: `Downloading ${meta.fileName}`,
          percent: Math.min(35, Math.round(basePct + (percent / 100) * slice)),
        });
      },
    });

    reportProgress(uploadId, {
      phase: "uploading",
      fileIndex,
      filesTotal,
      currentFile: meta.fileName,
      message: `Uploading ${meta.fileName} to Cloudinary`,
      percent: Math.min(40, Math.round(35 + (fileIndex / Math.max(filesTotal, 1)) * 5)),
      bytesLoaded: 0,
      bytesTotal: meta.size || 0,
    });

    const cloudResult = await uploadContentPdfToCloudinary({
      absoluteFilePath: tmpPath,
      cloudType,
      courseFolder: folders.courseFolder,
      batchFolder: folders.batchFolder,
      subjectName: folders.subjectName,
      titleHint: meta.fileName,
      originalFilename: meta.fileName,
      onProgress: ({ bytesUploaded, bytesTotal, percent, instantaneousBps }) => {
        const slice = filesTotal > 0 ? 55 / filesTotal : 55;
        const basePct = 40 + (fileIndex / Math.max(filesTotal, 1)) * slice;
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
      videoUrl: cloudResult.secure_url,
      publicId: cloudResult.public_id,
      cloudType,
    };
  } catch (error) {
    console.warn(
      `[telegram-pdf] Cloudinary upload failed for message ${meta.messageId}, using Telegram stream:`,
      error.message
    );
    reportProgress(uploadId, {
      phase: "finalizing",
      fileIndex,
      filesTotal,
      currentFile: meta.fileName,
      message: `Using Telegram stream for ${meta.fileName}`,
    });
    return { ...base, sourceType: "telegram" };
  } finally {
    safeUnlink(tmpPath);
  }
};

export const isCloudinaryConfigured = () => isKnownCloud(getDefaultCloud());
