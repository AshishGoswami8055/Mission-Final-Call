import mongoose from "mongoose";

const readingSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    date: { type: String, required: true, index: true },
    targetMinutes: { type: Number, default: 60 },
    actualMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["idle", "running", "paused", "completed"],
      default: "idle",
    },
    startedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    accumulatedSeconds: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

readingSessionSchema.index({ userId: 1, date: 1 }, { unique: true });

const ReadingSession = mongoose.model("ReadingSession", readingSessionSchema);

export default ReadingSession;
