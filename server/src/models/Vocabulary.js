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
    antonyms: {
      type: [String],
      default: [],
    },
    relatedWords: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    rootWord: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    rootMeaning: {
      type: String,
      default: "",
      trim: true,
    },
    partOfSpeech: {
      type: String,
      default: "",
      trim: true,
    },
    mnemonic: {
      type: String,
      default: "",
      trim: true,
    },
    examTag: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
      index: true,
    },
    clozeSentence: {
      type: String,
      default: "",
      trim: true,
    },
    source: {
      type: String,
      default: "manual",
      trim: true,
    },
    origin: {
      type: String,
      default: "",
      trim: true,
    },
    frequencyHint: {
      type: String,
      default: "",
      trim: true,
    },
    archived: {
      type: Boolean,
      default: false,
      index: true,
    },
    favorite: {
      type: Boolean,
      default: false,
      index: true,
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
    correctCount: {
      type: Number,
      default: 0,
    },
    wrongCount: {
      type: Number,
      default: 0,
      index: true,
    },
    confidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    lastReviewedAt: {
      type: Date,
      default: null,
    },
    lastWrongAt: {
      type: Date,
      default: null,
      index: true,
    },
    masteredAt: {
      type: Date,
      default: null,
    },
    updatedByMode: {
      type: String,
      default: "",
      trim: true,
    },
    lastPracticeMode: {
      type: String,
      default: "",
      trim: true,
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
vocabularySchema.index({ userId: 1, archived: 1, nextReviewAt: 1 });
vocabularySchema.index({ userId: 1, wrongCount: -1, lastWrongAt: -1 });
vocabularySchema.index({ userId: 1, rootWord: 1, type: 1 });

const Vocabulary = mongoose.model("Vocabulary", vocabularySchema);

export default Vocabulary;
