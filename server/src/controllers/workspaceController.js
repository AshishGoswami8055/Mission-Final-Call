import Content from "../models/Content.js";
import { isYouTubeConfigured, getYouTubeStatus } from "../services/youtubeUploadService.js";

const EXAM_DATE = new Date("2026-09-13T00:00:00");

const isPaperExtractEnabled = () => Boolean(String(process.env.OPENAI_API_KEY || "").trim());

const getExamCountdownDays = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exam = new Date(EXAM_DATE);
  exam.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((exam - now) / 86400000));
};

/** Public workspace snapshot for login page — no auth required. */
export const getPublicWorkspaceStats = async (_req, res) => {
  try {
    const [videoCount, pdfCount] = await Promise.all([
      Content.countDocuments({ type: "video" }),
      Content.countDocuments({ type: "pdf" }),
    ]);

    res.json({
      examCountdownDays: getExamCountdownDays(),
      examDate: "2026-09-13",
      totalItems: videoCount + pdfCount,
      videoCount,
      pdfCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not load workspace stats" });
  }
};

/** Authenticated feature flags for the admin UI. */
export const getWorkspaceCapabilities = async (_req, res) => {
  let youtube = { configured: false, connected: false };
  try {
    youtube = await getYouTubeStatus();
  } catch {
    youtube = { configured: isYouTubeConfigured(), connected: false };
  }

  res.json({
    paperExtract: isPaperExtractEnabled(),
    youtubeUpload: Boolean(youtube.configured && youtube.connected),
    youtubeConfigured: Boolean(youtube.configured),
  });
};
