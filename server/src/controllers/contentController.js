import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import Chapter from "../models/Chapter.js";
import Content from "../models/Content.js";
import Progress from "../models/Progress.js";
import Subject from "../models/Subject.js";
import {
  detectTypeFromMime,
  detectTypeFromUrl,
  getYouTubeThumbnail,
  isTelegramUrl,
  applyTelegramVideoLink,
  parseChapterAndTitleFromFilename,
} from "../utils/contentHelpers.js";
import { getUploadFolderForCourseId } from "../config/cdsCourses.js";
import { downloadYouTubeVideo } from "../services/youtubeDownloadService.js";
import { destroyContentAssets } from "../services/contentCleanupService.js";
import {
  safeUnlink,
  uploadVideoToCloudinary,
} from "../services/cloudinaryUploadService.js";
import { resolveCloudForSubject } from "./cloudMappingController.js";
import { TEMP_VIDEO_UPLOAD_DIR } from "../middlewares/uploadMiddleware.js";
import {
  clearProgress,
  completeProgress,
  failProgress,
  getProgress,
  initProgress,
  setProgress,
} from "../services/uploadProgressBus.js";
import { prepareVideoForCloud } from "../services/videoCloudPrepService.js";
import { migrateTelegramVideoContentToCloudinary } from "../services/telegramVideoImportService.js";
import {
  getPlaybackCacheStatus,
  getPlaybackCacheStorageStats,
  isCacheEligibleContent,
  removePlaybackCache,
  startPlaybackCacheDownload,
  touchPlaybackCache,
} from "../services/videoPlaybackCacheService.js";
import {
  getLocalLibraryStatus,
  getLocalLibraryStorageStats,
  isLocalLibraryEnabled,
  isLocalLibraryEligibleContent,
  removeLocalLibraryFile,
  startLocalLibraryDownload,
} from "../services/localLibraryService.js";
import { formatBytesLabel } from "../utils/contentPlayback.js";

const assertLocalLibrary = (_req, res, next) => {
  if (!isLocalLibraryEnabled()) {
    return res.status(403).json({
      message: "Smooth playback (PC library) is only available on the local study server.",
    });
  }
  next();
};

const isProductionMediaMode = () => process.env.NODE_ENV === "production";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");

const resolveUploadContext = (subject) => {
  const prog = subject?.programmeId;
  return {
    courseFolder: getUploadFolderForCourseId(prog?.cdsCycleId),
    batchFolder: prog?.folderSlug || "Main",
    subjectName: subject?.name || "subject",
  };
};

const buildVideoTitleFromFilename = (originalname) => parseChapterAndTitleFromFilename(originalname).title;

const isAutoCreateChapters = (body) =>
  String(body?.autoCreateChapters || "") === "1" || body?.autoCreateChapters === true;

/** Find or create a chapter under a subject (case-insensitive name match). */
const getOrCreateChapterForSubject = async (subjectId, chapterName) => {
  const normalized = String(chapterName || "").trim();
  if (!normalized) throw new Error("Chapter name is empty");

  const exact = await Chapter.findOne({ subjectId, chapterName: normalized });
  if (exact) return exact;

  const siblings = await Chapter.find({ subjectId }).select("chapterName");
  const key = normalized.toLowerCase();
  const ci = siblings.find((c) => c.chapterName.trim().toLowerCase() === key);
  if (ci) return ci;

  try {
    return await Chapter.create({ subjectId, chapterName: normalized });
  } catch (err) {
    if (err?.code === 11000) {
      return Chapter.findOne({ subjectId, chapterName: normalized });
    }
    throw err;
  }
};

const toUploadsRelativePath = (absolutePath) => {
  const absolute = path.resolve(absolutePath);
  if (!absolute.startsWith(uploadRoot)) return null;
  const rel = path.relative(uploadRoot, absolute).split(path.sep).join("/");
  return `/uploads/${rel}`;
};

const removeLocalFile = (relativeFilePath) => {
  if (!relativeFilePath) return;
  const trimmed = relativeFilePath.replace(/^\/+/, "");
  const absolute = path.resolve(__dirname, "..", "..", "..", trimmed);
  if (absolute.startsWith(uploadRoot) && fs.existsSync(absolute)) {
    fs.unlinkSync(absolute);
  }
};

const mapContent = (content, completedContentIds = new Set()) => {
  const item = typeof content.toObject === "function" ? content.toObject() : { ...content };
  item.completed = completedContentIds.has(String(item._id));
  return item;
};

const emptyPagination = (pageNumber, limitNumber) => ({
  page: pageNumber,
  limit: limitNumber,
  total: 0,
  totalPages: 1,
});

export const getContents = async (req, res) => {
  const { subjectId, chapterId, type, search, sort = "newest", page = 1, limit = 20, programmeId } = req.query;
  const filter = {};
  if (subjectId) filter.subjectId = subjectId;
  if (chapterId) filter.chapterId = chapterId;
  if (type) filter.type = type;
  if (search) filter.title = { $regex: search, $options: "i" };

  const pageNumber = Math.max(Number(page) || 1, 1);
  const hasProgrammeScope =
    programmeId && mongoose.Types.ObjectId.isValid(String(programmeId));
  const maxLimit = hasProgrammeScope ? 5000 : 100;
  const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), maxLimit);
  const skip = (pageNumber - 1) * limitNumber;

  let allowedSubjectIds = null;
  if (programmeId && mongoose.Types.ObjectId.isValid(String(programmeId))) {
    const subs = await Subject.find({ programmeId }).select("_id");
    allowedSubjectIds = subs.map((s) => s._id);
    if (subjectId) {
      const allowed = allowedSubjectIds.some((id) => String(id) === String(subjectId));
      if (!allowed) {
        return res.json({ items: [], pagination: emptyPagination(pageNumber, limitNumber) });
      }
    } else if (chapterId) {
      const ch = await Chapter.findById(chapterId).select("subjectId");
      const ok = ch && allowedSubjectIds.some((id) => String(id) === String(ch.subjectId));
      if (!ok) {
        return res.json({ items: [], pagination: emptyPagination(pageNumber, limitNumber) });
      }
    } else {
      if (!allowedSubjectIds.length) {
        filter.subjectId = { $in: [] };
      } else {
        filter.subjectId = { $in: allowedSubjectIds };
      }
    }
  }

  const aggregateFilter = { ...filter };
  if (aggregateFilter.subjectId && !aggregateFilter.subjectId.$in) {
    aggregateFilter.subjectId = new mongoose.Types.ObjectId(aggregateFilter.subjectId);
  }
  if (aggregateFilter.subjectId && aggregateFilter.subjectId.$in) {
    aggregateFilter.subjectId = {
      $in: aggregateFilter.subjectId.$in.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }
  if (aggregateFilter.chapterId) {
    aggregateFilter.chapterId = new mongoose.Types.ObjectId(aggregateFilter.chapterId);
  }
  const [contents, total] = await Promise.all([
    sort === "chapter"
      ? Content.aggregate([
          { $match: aggregateFilter },
          {
            $lookup: {
              from: "subjects",
              localField: "subjectId",
              foreignField: "_id",
              as: "subjectId",
            },
          },
          {
            $lookup: {
              from: "chapters",
              localField: "chapterId",
              foreignField: "_id",
              as: "chapterId",
            },
          },
          { $unwind: { path: "$subjectId", preserveNullAndEmptyArrays: true } },
          { $unwind: { path: "$chapterId", preserveNullAndEmptyArrays: true } },
          { $sort: { "chapterId.chapterName": 1, title: 1, createdAt: 1 } },
          { $skip: skip },
          { $limit: limitNumber },
        ]).collation({ locale: "en", numericOrdering: true })
      : Content.find(filter)
          .populate("subjectId", "name")
          .populate("chapterId", "chapterName")
          .sort({ createdAt: sort === "oldest" ? 1 : -1 })
          .skip(skip)
          .limit(limitNumber),
    Content.countDocuments(filter),
  ]);

  const progress = await Progress.find({ userId: req.user._id, completed: true }).select("contentId");
  const completedSet = new Set(progress.map((entry) => String(entry.contentId)));

  const payload = contents.map((item) => mapContent(item, completedSet));
  res.json({
    items: payload,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber) || 1,
    },
  });
};

export const getContentById = async (req, res) => {
  const content = await Content.findById(req.params.id)
    .populate("subjectId", "name")
    .populate("chapterId", "chapterName");
  if (!content) return res.status(404).json({ message: "Content not found" });

  const progress = await Progress.findOne({
    userId: req.user._id,
    contentId: content._id,
    completed: true,
  });

  res.json({
    ...content.toObject(),
    completed: Boolean(progress),
  });
};

export const getUploadProgress = (req, res) => {
  const state = getProgress(req.params.uploadId);
  if (!state) return res.json({ phase: "idle" });
  res.json(state);
};

export const createContent = async (req, res) => {
  const { subjectId, chapterId, title, sourceType, url, uploadId } = req.body;
  const autoCreateChapters = isAutoCreateChapters(req.body);
  if (!subjectId || !sourceType) {
    return res.status(400).json({ message: "subjectId and sourceType are required" });
  }
  if (!autoCreateChapters && !chapterId) {
    return res.status(400).json({ message: "chapterId is required (or enable auto-create chapters)" });
  }
  if (uploadId) {
    initProgress(uploadId, {
      phase: "received",
      message: "Validating request",
      filesTotal: 1,
      currentFile: req.file?.originalname || title || null,
    });
  }

  const subject = await Subject.findById(subjectId).populate("programmeId", "folderSlug cdsCycleId");
  if (!subject) return res.status(404).json({ message: "Subject not found" });

  let resolvedChapterId = chapterId;
  if (autoCreateChapters && req.file) {
    const { chapterName } = parseChapterAndTitleFromFilename(req.file.originalname);
    const chapter = await getOrCreateChapterForSubject(subjectId, chapterName);
    resolvedChapterId = chapter._id;
  } else if (autoCreateChapters && title) {
    const chapter = await getOrCreateChapterForSubject(subjectId, String(title).trim());
    resolvedChapterId = chapter._id;
  } else if (chapterId) {
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) return res.status(404).json({ message: "Chapter not found" });
    resolvedChapterId = chapter._id;
  }

  const doc = {
    subjectId,
    chapterId: resolvedChapterId,
    title: title || null,
    type: null,
    sourceType: null,
    filePath: null,
    url: null,
    thumbnail: null,
    videoUrl: null,
    publicId: null,
    cloudType: null,
    duration: null,
    uploadedAt: null,
    videoSourceType: null,
  };

  try {
    if (sourceType === "upload") {
      if (!req.file) return res.status(400).json({ message: "File upload is required" });
      const parsedFromFile = parseChapterAndTitleFromFilename(req.file.originalname);
      if (!doc.title) doc.title = parsedFromFile.title;
      if (!doc.title) return res.status(400).json({ message: "Title is required for single upload" });
      const detectedType = detectTypeFromMime(req.file.mimetype);
      if (!detectedType) {
        safeUnlink(req.file.path);
        return res.status(400).json({ message: "Invalid uploaded file type" });
      }
      doc.type = detectedType;

      if (detectedType === "video") {
        if (isProductionMediaMode()) {
          safeUnlink(req.file.path);
          return res.status(400).json({
            message:
              "Video file uploads are disabled in production. Add a Telegram video link (t.me / telegram.me) instead.",
          });
        }
        const filePath = toUploadsRelativePath(req.file.path);
        if (!filePath) {
          safeUnlink(req.file.path);
          return res.status(500).json({ message: "Could not resolve uploaded file path" });
        }
        doc.sourceType = "upload";
        doc.filePath = filePath;
        doc.videoSourceType = "local";
        doc.uploadedAt = new Date();
      } else {
        // PDF — keep on local disk.
        const filePath = toUploadsRelativePath(req.file.path);
        if (!filePath) {
          safeUnlink(req.file.path);
          return res.status(500).json({ message: "Could not resolve uploaded file path" });
        }
        doc.sourceType = "upload";
        doc.filePath = filePath;
        doc.videoSourceType = null;
        doc.uploadedAt = new Date();
      }
    } else if (sourceType === "url") {
      if (!url) return res.status(400).json({ message: "URL is required for url sourceType" });
      if (!doc.title) return res.status(400).json({ message: "Title is required for URL content" });
      const videoSourceTypeRaw = String(req.body.videoSourceType || "").toLowerCase();

      const linkFromBody = String(req.body.videoUrl || url || "").trim();

      if (isProductionMediaMode()) {
        if (videoSourceTypeRaw === "telegram") {
          try {
            applyTelegramVideoLink(doc, linkFromBody);
          } catch (err) {
            return res.status(400).json({ message: err.message });
          }
          const thumb = typeof req.body.thumbnail === "string" ? req.body.thumbnail.trim() : "";
          doc.thumbnail = thumb || null;
        } else {
          const detectedType = detectTypeFromUrl(url);
          if (!detectedType) {
            return res.status(400).json({ message: "Could not auto-detect URL type (video/pdf)" });
          }
          if (detectedType === "video") {
            return res.status(400).json({
              message:
                "In production, lesson videos use Telegram links. Choose 'Telegram video link' and paste a t.me URL.",
            });
          }
          doc.type = detectedType;
          doc.sourceType = "url";
          doc.url = url;
          doc.videoSourceType = null;
        }
      } else {
        const detectedType = detectTypeFromUrl(url);
        if (!detectedType) {
          return res.status(400).json({ message: "Could not auto-detect URL type (video/pdf)" });
        }
        doc.type = detectedType;
        doc.sourceType = "url";
        doc.url = url;
        if (detectedType === "video" && isTelegramUrl(url)) {
          try {
            applyTelegramVideoLink(doc, url);
          } catch (err) {
            return res.status(400).json({ message: err.message });
          }
        } else {
          doc.videoSourceType = null;
          doc.videoUrl = null;
          if (detectedType === "video") {
            doc.thumbnail = getYouTubeThumbnail(url);
          }
        }
      }
    } else if (sourceType === "youtube_download") {
      if (isProductionMediaMode()) {
        return res.status(400).json({
          message: "YouTube download/import is disabled in production. Use Telegram video links for lessons.",
        });
      }
      if (!url) {
        return res.status(400).json({ message: "YouTube URL is required for youtube_download sourceType" });
      }
      if (!/(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url)) {
        return res.status(400).json({ message: "Only YouTube URLs are allowed for direct download" });
      }

      const cloudType = await resolveCloudForSubject(subject._id);
      if (!cloudType) {
        if (uploadId) failProgress(uploadId, "No Cloudinary account configured");
        return res.status(500).json({
          message:
            "No Cloudinary account is configured. Add CLOUDINARY_CLOUD1_NAME / _API_KEY / _API_SECRET to server/.env.",
        });
      }

      if (uploadId) {
        setProgress(uploadId, {
          phase: "downloading",
          message: "Downloading video from YouTube",
          percent: 0,
        });
      }
      const downloaded = await downloadYouTubeVideo({
        url,
        titleHint: doc.title,
        subjectLabel: subject.name,
        targetDir: TEMP_VIDEO_UPLOAD_DIR,
      });

      const { courseFolder, batchFolder, subjectName } = resolveUploadContext(subject);
      let preparedYt = null;
      try {
        preparedYt = await prepareVideoForCloud({
          sourcePath: downloaded.absolutePath,
          originalSizeBytes: fs.existsSync(downloaded.absolutePath)
            ? fs.statSync(downloaded.absolutePath).size
            : 0,
          uploadId,
        });
        if (uploadId) {
          setProgress(uploadId, {
            phase: "uploading",
            cloudType,
            currentFile: downloaded.resolvedTitle || doc.title,
            message: `Uploading to Cloudinary (${cloudType})`,
            percent: 0,
            bytesLoaded: 0,
            bytesTotal: 0,
          });
        }
        const uploadResult = await uploadVideoToCloudinary({
          absoluteFilePath: preparedYt.pathToUpload,
          cloudType,
          courseFolder,
          batchFolder,
          subjectName,
          titleHint: doc.title || downloaded.resolvedTitle,
          originalFilename: downloaded.meta?.originalFilename,
          onProgress: uploadId
            ? ({ bytesUploaded, bytesTotal, percent, instantaneousBps }) => {
                setProgress(uploadId, {
                  phase: "uploading",
                  bytesLoaded: bytesUploaded,
                  bytesTotal,
                  percent: Math.min(99, percent),
                  bytesPerSecond: instantaneousBps,
                });
              }
            : undefined,
        });
        doc.type = "video";
        doc.sourceType = "cloudinary";
        doc.videoSourceType = null;
        doc.title = doc.title || downloaded.resolvedTitle;
        doc.videoUrl = uploadResult.secure_url;
        doc.publicId = uploadResult.public_id;
        doc.cloudType = cloudType;
        doc.duration = Number(uploadResult.duration) || downloaded.meta?.durationSeconds || null;
        doc.thumbnail = getYouTubeThumbnail(url);
        doc.uploadedAt = new Date();
      } finally {
        if (preparedYt?.compressedPath) safeUnlink(preparedYt.compressedPath);
        safeUnlink(downloaded.absolutePath);
      }
    } else {
      return res.status(400).json({ message: "sourceType must be upload, url, or youtube_download" });
    }

    const content = await Content.create(doc);
    const populated = await Content.findById(content._id)
      .populate("subjectId", "name")
      .populate("chapterId", "chapterName");
    if (uploadId) {
      completeProgress(uploadId, { message: "Done", currentFile: content.title });
      setTimeout(() => clearProgress(uploadId), 30_000);
    }
    return res.status(201).json(mapContent(populated));
  } catch (error) {
    if (req.file?.path) safeUnlink(req.file.path);
    if (uploadId) failProgress(uploadId, error?.message || "Could not create content");
    console.error("[content.create] failed:", error);
    return res.status(500).json({
      message: error?.message || "Could not create content",
    });
  }
};

export const bulkUploadContents = async (req, res) => {
  const { subjectId, chapterId, titlePrefix = "", uploadId } = req.body;
  const autoCreateChapters = isAutoCreateChapters(req.body);
  if (!subjectId) {
    return res.status(400).json({ message: "subjectId is required" });
  }
  if (!autoCreateChapters && !chapterId) {
    return res.status(400).json({ message: "chapterId is required (or enable auto-create chapters)" });
  }
  if (!req.files?.length) {
    return res.status(400).json({ message: "At least one file is required" });
  }

  if (uploadId) {
    initProgress(uploadId, {
      phase: "received",
      message: "Validating files",
      filesTotal: req.files.length,
      fileIndex: 0,
    });
  }

  const subject = await Subject.findById(subjectId).populate("programmeId", "folderSlug cdsCycleId");
  if (!subject) {
    req.files.forEach((file) => safeUnlink(file.path));
    if (uploadId) failProgress(uploadId, "Subject not found");
    return res.status(404).json({ message: "Subject not found" });
  }

  if (!autoCreateChapters && chapterId) {
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      req.files.forEach((file) => safeUnlink(file.path));
      if (uploadId) failProgress(uploadId, "Chapter not found");
      return res.status(404).json({ message: "Chapter not found" });
    }
  }

  const createdDocs = [];
  const failures = [];
  const chaptersCreated = new Set();
  const chapterCache = new Map();

  for (let i = 0; i < req.files.length; i += 1) {
    const file = req.files[i];
    const detectedType = detectTypeFromMime(file.mimetype);
    if (!detectedType) {
      safeUnlink(file.path);
      failures.push({ file: file.originalname, reason: "Unsupported file type" });
      continue;
    }

    let fileChapterId = chapterId;
    const parsed = parseChapterAndTitleFromFilename(file.originalname);
    const computedTitle = titlePrefix ? `${titlePrefix} - ${parsed.title}` : parsed.title;

    try {
      if (autoCreateChapters) {
        const cacheKey = parsed.chapterName.toLowerCase();
        if (!chapterCache.has(cacheKey)) {
          const before = await Chapter.countDocuments({ subjectId });
          const chapterDoc = await getOrCreateChapterForSubject(subjectId, parsed.chapterName);
          const after = await Chapter.countDocuments({ subjectId });
          if (after > before) chaptersCreated.add(parsed.chapterName);
          chapterCache.set(cacheKey, chapterDoc._id);
        }
        fileChapterId = chapterCache.get(cacheKey);
      }

      if (detectedType === "video") {
        if (isProductionMediaMode()) {
          safeUnlink(file.path);
          failures.push({
            file: file.originalname,
            reason: "Video files are disabled in production; add Telegram video links instead.",
          });
          continue;
        }
        const resolvedPath = toUploadsRelativePath(file.path);
        if (!resolvedPath) {
          safeUnlink(file.path);
          failures.push({ file: file.originalname, reason: "Could not resolve upload path" });
          continue;
        }
        createdDocs.push({
          subjectId,
          chapterId: fileChapterId,
          title: computedTitle,
          type: "video",
          sourceType: "upload",
          filePath: resolvedPath,
          url: null,
          thumbnail: null,
          videoUrl: null,
          publicId: null,
          cloudType: null,
          videoSourceType: "local",
          duration: null,
          uploadedAt: new Date(),
        });
      } else {
        const resolvedPath = toUploadsRelativePath(file.path);
        if (!resolvedPath) {
          safeUnlink(file.path);
          failures.push({ file: file.originalname, reason: "Could not resolve upload path" });
          continue;
        }
        createdDocs.push({
          subjectId,
          chapterId: fileChapterId,
          title: computedTitle,
          type: "pdf",
          sourceType: "upload",
          filePath: resolvedPath,
          url: null,
          thumbnail: null,
          videoUrl: null,
          publicId: null,
          cloudType: null,
          videoSourceType: null,
          duration: null,
          uploadedAt: new Date(),
        });
      }
    } catch (error) {
      safeUnlink(file.path);
      console.error(`[content.bulk] ${file.originalname} failed:`, error);
      failures.push({ file: file.originalname, reason: error.message || "Upload failed" });
    }
  }

  if (!createdDocs.length) {
    if (uploadId) failProgress(uploadId, "No files were uploaded");
    return res.status(400).json({
      message: "No files were uploaded.",
      failures,
    });
  }

  if (uploadId) {
    setProgress(uploadId, { phase: "finalizing", percent: 99, message: "Saving records" });
  }

  const created = await Content.insertMany(createdDocs);
  const ids = created.map((item) => item._id);
  const populated = await Content.find({ _id: { $in: ids } })
    .populate("subjectId", "name")
    .populate("chapterId", "chapterName")
    .sort({ createdAt: -1 });

  if (uploadId) {
    completeProgress(uploadId, {
      message: `${populated.length} of ${req.files.length} uploaded`,
      fileIndex: req.files.length,
      filesTotal: req.files.length,
    });
    setTimeout(() => clearProgress(uploadId), 30_000);
  }

  const chapterNote =
    chaptersCreated.size > 0
      ? ` Created ${chaptersCreated.size} new chapter(s): ${[...chaptersCreated].slice(0, 5).join(", ")}${chaptersCreated.size > 5 ? "…" : ""}.`
      : "";

  return res.status(201).json({
    message: `${populated.length} of ${req.files.length} file(s) uploaded successfully.${chapterNote}`,
    items: populated.map((item) => mapContent(item)),
    chaptersCreated: [...chaptersCreated],
    failures: failures.length ? failures : undefined,
  });
};

export const updateContent = async (req, res) => {
  const content = await Content.findById(req.params.id);
  if (!content) return res.status(404).json({ message: "Content not found" });

  const { title, subjectId, chapterId, url, videoUrl, thumbnail } = req.body;
  content.title = title ?? content.title;
  content.subjectId = subjectId ?? content.subjectId;
  content.chapterId = chapterId ?? content.chapterId;

  const linkUpdate = videoUrl !== undefined ? videoUrl : url;
  if (linkUpdate !== undefined && content.type === "video" && content.videoSourceType === "telegram") {
    const next = String(linkUpdate).trim();
    if (!isTelegramUrl(next)) {
      return res.status(400).json({ message: "Use a valid Telegram link (t.me or telegram.me)." });
    }
    content.videoUrl = next;
    content.url = next;
  }
  if (thumbnail !== undefined && content.type === "video" && content.videoSourceType === "telegram") {
    content.thumbnail = thumbnail ? String(thumbnail).trim() : null;
  }

  await content.save();

  const populated = await Content.findById(content._id)
    .populate("subjectId", "name")
    .populate("chapterId", "chapterName");
  res.json(mapContent(populated));
};

/** Upload an existing Telegram-stream video to Cloudinary for smooth CDN playback. */
export const cloudifyContent = async (req, res) => {
  const content = await Content.findById(req.params.id);
  if (!content) return res.status(404).json({ message: "Content not found" });
  if (content.type !== "video") {
    return res.status(400).json({ message: "Only videos can be moved to Cloudinary." });
  }
  if (content.sourceType === "cloudinary" && content.videoUrl) {
    const populated = await Content.findById(content._id)
      .populate("subjectId", "name")
      .populate("chapterId", "chapterName");
    return res.json({ message: "Already on Cloudinary", content: mapContent(populated) });
  }

  const uploadId = String(req.body?.uploadId || "").trim() || null;
  try {
    const updated = await migrateTelegramVideoContentToCloudinary(content, { uploadId });
    const populated = await Content.findById(updated._id)
      .populate("subjectId", "name")
      .populate("chapterId", "chapterName");
    res.json({
      message: "Video uploaded to Cloudinary — playback should be smooth now.",
      content: mapContent(populated),
    });
  } catch (error) {
    if (uploadId) failProgress(uploadId, error.message || "Cloudify failed");
    console.error("[content.cloudify]", error);
    res.status(500).json({ message: error.message || "Could not upload video to Cloudinary." });
  }
};

export const getPlaybackCacheStorage = async (_req, res) => {
  try {
    const storage = getPlaybackCacheStorageStats();
    res.json({
      ...storage,
      usedLabel: formatBytesLabel(storage.usedBytes),
      maxLabel: formatBytesLabel(storage.maxBytes),
      freeLabel: formatBytesLabel(storage.freeBytes),
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read cache storage" });
  }
};

export const getContentPlaybackCache = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (!content) return res.status(404).json({ message: "Content not found" });

    const status = getPlaybackCacheStatus(content._id);
    res.json({
      ...status,
      eligible: isCacheEligibleContent(content),
      sizeLabel: status.sizeBytes ? formatBytesLabel(status.sizeBytes) : null,
      storage: {
        ...status.storage,
        usedLabel: formatBytesLabel(status.storage.usedBytes),
        maxLabel: formatBytesLabel(status.storage.maxBytes),
        freeLabel: formatBytesLabel(status.storage.freeBytes),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read playback cache" });
  }
};

export const startContentPlaybackCache = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (!content) return res.status(404).json({ message: "Content not found" });
    if (!isCacheEligibleContent(content)) {
      return res.status(400).json({
        message: "This video type cannot be downloaded for local playback.",
      });
    }

    const status = await startPlaybackCacheDownload(content._id);
    res.json({
      ...status,
      eligible: true,
      sizeLabel: status.sizeBytes ? formatBytesLabel(status.sizeBytes) : null,
      storage: {
        ...status.storage,
        usedLabel: formatBytesLabel(status.storage.usedBytes),
        maxLabel: formatBytesLabel(status.storage.maxBytes),
        freeLabel: formatBytesLabel(status.storage.freeBytes),
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not start download" });
  }
};

export const deleteContentPlaybackCache = async (req, res) => {
  try {
    removePlaybackCache(req.params.id);
    const storage = getPlaybackCacheStorageStats();
    res.json({
      message: "Cached copy removed.",
      storage: {
        ...storage,
        usedLabel: formatBytesLabel(storage.usedBytes),
        maxLabel: formatBytesLabel(storage.maxBytes),
        freeLabel: formatBytesLabel(storage.freeBytes),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not remove cache" });
  }
};

export const getLocalLibraryStorage = async (_req, res) => {
  try {
    const storage = getLocalLibraryStorageStats();
    res.json({
      ...storage,
      usedLabel: formatBytesLabel(storage.usedBytes),
      maxLabel: storage.maxBytes > 0 ? formatBytesLabel(storage.maxBytes) : null,
      freeLabel: storage.freeBytes != null ? formatBytesLabel(storage.freeBytes) : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read PC library storage" });
  }
};

export const getContentLocalLibrary = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (!content) return res.status(404).json({ message: "Content not found" });

    const status = getLocalLibraryStatus(content._id);
    res.json({
      ...status,
      eligible: isLocalLibraryEligibleContent(content),
      sizeLabel: status.sizeBytes ? formatBytesLabel(status.sizeBytes) : null,
      storage: {
        ...status.storage,
        usedLabel: formatBytesLabel(status.storage.usedBytes),
        maxLabel: status.storage.maxBytes > 0 ? formatBytesLabel(status.storage.maxBytes) : null,
        freeLabel:
          status.storage.freeBytes != null ? formatBytesLabel(status.storage.freeBytes) : null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not read PC library status" });
  }
};

export const startContentLocalLibrary = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (!content) return res.status(404).json({ message: "Content not found" });
    if (!isLocalLibraryEligibleContent(content)) {
      return res.status(400).json({
        message: "This video type cannot be saved to the PC library.",
      });
    }

    const status = await startLocalLibraryDownload(content._id);
    res.json({
      ...status,
      eligible: true,
      sizeLabel: status.sizeBytes ? formatBytesLabel(status.sizeBytes) : null,
      storage: {
        ...status.storage,
        usedLabel: formatBytesLabel(status.storage.usedBytes),
        maxLabel: status.storage.maxBytes > 0 ? formatBytesLabel(status.storage.maxBytes) : null,
        freeLabel:
          status.storage.freeBytes != null ? formatBytesLabel(status.storage.freeBytes) : null,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not start download" });
  }
};

export const deleteContentLocalLibrary = async (req, res) => {
  try {
    removeLocalLibraryFile(req.params.id);
    const storage = getLocalLibraryStorageStats();
    res.json({
      message: "Removed from PC library.",
      storage: {
        ...storage,
        usedLabel: formatBytesLabel(storage.usedBytes),
        maxLabel: storage.maxBytes > 0 ? formatBytesLabel(storage.maxBytes) : null,
        freeLabel: storage.freeBytes != null ? formatBytesLabel(storage.freeBytes) : null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not remove from PC library" });
  }
};

export { assertLocalLibrary };

export const deleteContent = async (req, res) => {
  const content = await Content.findById(req.params.id);
  if (!content) return res.status(404).json({ message: "Content not found" });

  await destroyContentAssets(content);

  await Progress.deleteMany({ contentId: content._id });
  await content.deleteOne();
  res.json({ message: "Content deleted" });
};
