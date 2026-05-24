import Content from "../models/Content.js";
import Subject from "../models/Subject.js";
import { isTelegramStreamContent } from "../utils/contentPlayback.js";
import { isCacheEligibleContent } from "./videoPlaybackCacheService.js";

const sanitizeFileName = (name = "video.mp4") => {
  const base = String(name || "video.mp4")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim();
  return base || "video.mp4";
};

const videoFileName = (content) => {
  if (content.telegramFileName) return sanitizeFileName(content.telegramFileName);
  const title = String(content.title || "video")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim();
  return sanitizeFileName(`${title}.mp4`);
};

export const toCloudinaryDownloadUrl = (videoUrl, fileName) => {
  if (!videoUrl) return "";
  const safe = encodeURIComponent(fileName || "video.mp4");
  if (videoUrl.includes("/upload/")) {
    return videoUrl.replace("/upload/", `/upload/fl_attachment:${safe}/`);
  }
  return videoUrl;
};

export const buildContentDownloadItem = (content, { apiBase, token }) => {
  if (!content || content.type !== "video") return null;

  const fileName = videoFileName(content);
  const contentId = String(content._id);

  if (content.sourceType === "cloudinary" && content.videoUrl) {
    return {
      contentId,
      title: content.title,
      fileName,
      downloadUrl: toCloudinaryDownloadUrl(content.videoUrl, fileName),
      method: "direct",
    };
  }

  if (content.sourceType === "upload" && content.filePath) {
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    return {
      contentId,
      title: content.title,
      fileName,
      downloadUrl: `${apiBase}/contents/${contentId}/download-file${qs}`,
      method: "api",
    };
  }

  if (isTelegramStreamContent(content)) {
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    return {
      contentId,
      title: content.title,
      fileName,
      downloadUrl: `${apiBase}/contents/${contentId}/download-file${qs}`,
      method: "api",
    };
  }

  return null;
};

export const getSubjectDownloadPack = async (subjectId, { apiBase, token }) => {
  const subject = await Subject.findById(subjectId);
  if (!subject) return null;

  const videos = await Content.find({ subjectId, type: "video" })
    .sort({ title: 1, createdAt: 1 })
    .lean();

  const items = videos
    .map((content) => buildContentDownloadItem(content, { apiBase, token }))
    .filter(Boolean);

  return {
    subjectId: String(subjectId),
    subjectName: subject.name,
    totalVideos: videos.length,
    downloadableCount: items.length,
    items,
  };
};

export const getSubjectLibraryVideos = async (subjectId) => {
  const subject = await Subject.findById(subjectId);
  if (!subject) return null;

  const videos = await Content.find({ subjectId, type: "video" })
    .sort({ title: 1, createdAt: 1 });

  const eligible = videos.filter(isCacheEligibleContent);

  return {
    subjectId: String(subjectId),
    subjectName: subject.name,
    totalVideos: videos.length,
    eligibleCount: eligible.length,
    videos: eligible,
  };
};
