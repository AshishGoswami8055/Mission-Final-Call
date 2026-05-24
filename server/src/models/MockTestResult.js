import mongoose from "mongoose";

const mockTestResultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    paperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paper",
      required: true,
      index: true,
    },
    missionId: { type: mongoose.Schema.Types.ObjectId, ref: "DailyMission", default: null },
    date: { type: String, required: true, index: true },
    title: { type: String, default: "" },
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    attemptedQuestions: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    accuracyPercent: { type: Number, default: 0 },
    timeTakenMinutes: { type: Number, default: 0 },
    weakSubjects: { type: [String], default: [] },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

mockTestResultSchema.index({ userId: 1, date: -1 });

const MockTestResult = mongoose.model("MockTestResult", mockTestResultSchema);

export default MockTestResult;
