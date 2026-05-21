import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["video", "pdf"],
      required: true,
    },
    sourceType: {
      type: String,
      enum: ["upload", "url", "cloudinary", "telegram"],
      required: true,
    },
    telegramSource: {
      type: Boolean,
      default: false,
    },
    telegramChannelId: {
      type: String,
      default: null,
    },
    telegramMessageId: {
      type: Number,
      default: null,
    },
    telegramFileName: {
      type: String,
      default: null,
    },
    telegramMimeType: {
      type: String,
      default: null,
    },
    telegramFileSize: {
      type: Number,
      default: null,
    },
    telegramTopicId: {
      type: Number,
      default: null,
    },
    filePath: {
      type: String,
      default: null,
    },
    url: {
      type: String,
      default: null,
    },
    thumbnail: {
      type: String,
      default: null,
    },
    /**
     * Playable / external video URL:
     * - Cloudinary CDN URL when sourceType === "cloudinary"
     * - Telegram (t.me) link when videoSourceType === "telegram" and no local file
     */
    videoUrl: {
      type: String,
      default: null,
    },
    publicId: {
      type: String,
      default: null,
      index: true,
    },
    cloudType: {
      type: String,
      default: null,
      index: true,
    },
    duration: {
      type: Number,
      default: null,
    },
    /**
     * Where the video file lives (only for type === "video").
     * - local: file in uploads (dev / localhost-style)
     * - telegram: external t.me / telegram.me link stored in `videoUrl` (and `url`)
     */
    videoSourceType: {
      type: String,
      enum: ["local", "telegram"],
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const Content = mongoose.model("Content", contentSchema);

export default Content;
