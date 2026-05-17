import mongoose from "mongoose";

const questionItemSchema = new mongoose.Schema(
  {
    number: { type: String, required: true },
    text: { type: String, default: "" },
    options: { type: [String], default: [] },
  },
  { _id: false }
);

const questionImageSchema = new mongoose.Schema(
  { number: { type: String, required: true }, path: { type: String, required: true } },
  { _id: false }
);

const paperAnalysisSchema = new mongoose.Schema(
  {
    paperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paper",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    questions: {
      type: [questionItemSchema],
      default: [],
    },
    questionImages: {
      type: [questionImageSchema],
      default: [],
    },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

paperAnalysisSchema.index({ paperId: 1 }, { unique: true });

const PaperAnalysis = mongoose.model("PaperAnalysis", paperAnalysisSchema);

export default PaperAnalysis;
