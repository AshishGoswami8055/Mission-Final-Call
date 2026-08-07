import mongoose from "mongoose";

const vocabularyReviewLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    vocabularyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vocabulary",
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VocabularyPracticeSession",
      default: null,
      index: true,
    },
    mode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    questionType: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    result: {
      type: String,
      enum: ["again", "good", "easy"],
      required: true,
      index: true,
    },
    correct: {
      type: Boolean,
      required: true,
      index: true,
    },
    responseTimeMs: {
      type: Number,
      default: 0,
      min: 0,
    },
    selectedAnswer: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

vocabularyReviewLogSchema.index({ userId: 1, createdAt: -1 });
vocabularyReviewLogSchema.index({ userId: 1, mode: 1, createdAt: -1 });
vocabularyReviewLogSchema.index({ userId: 1, vocabularyId: 1, createdAt: -1 });

const VocabularyReviewLog = mongoose.model(
  "VocabularyReviewLog",
  vocabularyReviewLogSchema
);

export default VocabularyReviewLog;
