import mongoose from "mongoose";

const paperProgressSchema = new mongoose.Schema(
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
    attempted: {
      type: Boolean,
      default: true,
    },
    attemptedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

paperProgressSchema.index({ userId: 1, paperId: 1 }, { unique: true });

const PaperProgress = mongoose.model("PaperProgress", paperProgressSchema);

export default PaperProgress;
