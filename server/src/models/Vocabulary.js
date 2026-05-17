import mongoose from "mongoose";

const vocabularySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["vocabulary", "idiom", "one_word"],
      default: "vocabulary",
      index: true,
    },
    word: {
      type: String,
      required: true,
      trim: true,
    },
    meaning: {
      type: String,
      required: true,
      trim: true,
    },
    example: {
      type: String,
      default: "",
      trim: true,
    },
    synonyms: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    level: {
      type: String,
      enum: ["new", "learning", "mastered"],
      default: "new",
      index: true,
    },
    easeFactor: {
      type: Number,
      default: 2.5,
    },
    intervalDays: {
      type: Number,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    lastReviewedAt: {
      type: Date,
      default: null,
    },
    nextReviewAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

vocabularySchema.index({ userId: 1, type: 1, word: 1 }, { unique: true });

const Vocabulary = mongoose.model("Vocabulary", vocabularySchema);

export default Vocabulary;
