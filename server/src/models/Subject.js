import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    programmeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Programme",
      required: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    /** Telegram forum topic id when subject was created from a channel topic */
    telegramTopicId: {
      type: Number,
      default: null,
      index: true,
    },
    /** Flat-channel subject key from caption metadata (Topic/Batch) */
    telegramSubjectKey: {
      type: String,
      default: null,
      index: true,
    },
    telegramChannelId: {
      type: String,
      default: null,
      index: true,
    },
    /** When syncing from Telegram, import video lessons (default true). */
    telegramImportVideos: {
      type: Boolean,
      default: true,
    },
    /** When syncing from Telegram, import PDF lessons (default true). */
    telegramImportPdfs: {
      type: Boolean,
      default: true,
    },
    /** Telegram message ids intentionally skipped during curated import (never re-offer as updates). */
    telegramSkippedMessageIds: {
      type: [Number],
      default: [],
    },
  },
  { timestamps: true }
);

subjectSchema.index({ name: 1, programmeId: 1 }, { unique: true });
subjectSchema.index({ programmeId: 1, telegramChannelId: 1, telegramTopicId: 1 });
subjectSchema.index({ programmeId: 1, telegramChannelId: 1, telegramSubjectKey: 1 });

const Subject = mongoose.model("Subject", subjectSchema);

export default Subject;
