import mongoose from "mongoose";

const studyAnalyticsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    period: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      required: true,
    },
    periodKey: { type: String, required: true, trim: true },
    totalStudyMinutes: { type: Number, default: 0 },
    readingMinutes: { type: Number, default: 0 },
    videoMinutes: { type: Number, default: 0 },
    mockTestsAttempted: { type: Number, default: 0 },
    missionsCompleted: { type: Number, default: 0 },
    missionsTotal: { type: Number, default: 0 },
    missionCompletionRate: { type: Number, default: 0 },
    consistencyScore: { type: Number, default: 0 },
    disciplineStreak: { type: Number, default: 0 },
    strongestSubjects: { type: [String], default: [] },
    weakestSubjects: { type: [String], default: [] },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

studyAnalyticsSchema.index({ userId: 1, period: 1, periodKey: 1 }, { unique: true });

const StudyAnalytics = mongoose.model("StudyAnalytics", studyAnalyticsSchema);

export default StudyAnalytics;
