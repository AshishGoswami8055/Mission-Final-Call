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
    telegramChannelId: {
      type: String,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

subjectSchema.index({ name: 1, programmeId: 1 }, { unique: true });
subjectSchema.index({ programmeId: 1, telegramChannelId: 1, telegramTopicId: 1 });

const Subject = mongoose.model("Subject", subjectSchema);

export default Subject;
