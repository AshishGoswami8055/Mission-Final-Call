import mongoose from "mongoose";

const answerSchema = new mongoose.Schema(
  {
    vocabularyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vocabulary",
      required: false,
      default: null,
    },
    questionType: { type: String, required: true },
    selectedAnswer: { type: String, default: "" },
    correct: { type: Boolean, required: true },
    skipped: { type: Boolean, default: false },
    result: {
      type: String,
      enum: ["again", "good", "easy"],
      required: true,
    },
    responseTimeMs: { type: Number, default: 0, min: 0 },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const vocabularyPracticeSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    mode: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["all", "vocabulary", "idiom", "one_word"],
      default: "all",
      index: true,
    },
    examMode: { type: Boolean, default: false },
    timed: { type: Boolean, default: false },
    durationSeconds: { type: Number, default: 0 },
    questionCount: { type: Number, required: true, min: 1, max: 100 },
    questions: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
      select: false,
    },
    answers: { type: [answerSchema], default: [] },
    status: {
      type: String,
      enum: ["active", "completed", "abandoned"],
      default: "active",
      index: true,
    },
    currentIndex: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    wrongAnswers: { type: Number, default: 0 },
    skippedQuestions: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 },
    weakWordsSeen: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vocabulary" }],
      default: [],
    },
    reviewUpdatesApplied: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now, index: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

vocabularyPracticeSessionSchema.index({ userId: 1, startedAt: -1 });
vocabularyPracticeSessionSchema.index({ userId: 1, status: 1, updatedAt: -1 });

const VocabularyPracticeSession = mongoose.model(
  "VocabularyPracticeSession",
  vocabularyPracticeSessionSchema
);

export default VocabularyPracticeSession;
