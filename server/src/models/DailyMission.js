import mongoose from "mongoose";

const missionItemSchema = new mongoose.Schema(
  {
    slot: {
      type: String,
      enum: ["english", "maths", "gs", "reading", "mock_test"],
      required: true,
    },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: "Content", default: null },
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: "Paper", default: null },
    title: { type: String, default: "" },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
    subjectName: { type: String, default: "" },
    chapterName: { type: String, default: "" },
    targetMinutes: { type: Number, default: null },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    reason: {
      type: String,
      enum: ["unwatched", "weak_subject", "backlog", "revision", "default", "sunday_mock"],
      default: "default",
    },
  },
  { _id: false }
);

const dailyMissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    missionType: {
      type: String,
      enum: ["daily", "sunday_mock"],
      default: "daily",
    },
    status: {
      type: String,
      enum: ["active", "completed", "partial"],
      default: "active",
    },
    items: { type: [missionItemSchema], default: [] },
    progressPercent: { type: Number, default: 0 },
    disciplineScore: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    generationMeta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

dailyMissionSchema.index({ userId: 1, date: 1 }, { unique: true });

const DailyMission = mongoose.model("DailyMission", dailyMissionSchema);

export default DailyMission;
