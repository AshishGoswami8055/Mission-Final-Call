import mongoose from "mongoose";

const studySessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    date: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["video", "reading", "mock", "mission"],
      required: true,
    },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: "Content", default: null },
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: "Paper", default: null },
    missionId: { type: mongoose.Schema.Types.ObjectId, ref: "DailyMission", default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
    subjectName: { type: String, default: "" },
    slot: { type: String, default: null },
    durationMinutes: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

studySessionSchema.index({ userId: 1, date: -1 });
studySessionSchema.index({ userId: 1, contentId: 1, createdAt: -1 });

const StudySession = mongoose.model("StudySession", studySessionSchema);

export default StudySession;
