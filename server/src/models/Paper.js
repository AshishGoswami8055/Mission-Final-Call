import mongoose from "mongoose";

const paperSchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    examType: {
      type: String,
      trim: true,
      default: "CDS",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    sourceType: {
      type: String,
      enum: ["upload", "url", "cloudinary"],
      required: true,
    },
    filePath: {
      type: String,
      default: null,
    },
    url: {
      type: String,
      default: null,
    },
    /** Cloudinary secure URL when sourceType === "cloudinary" (raw PDF). */
    pdfUrl: {
      type: String,
      default: null,
    },
    publicId: {
      type: String,
      default: null,
      index: true,
    },
    cloudType: {
      type: String,
      default: null,
      index: true,
    },
    durationMinutes: {
      type: Number,
      default: null,
    },
    totalQuestions: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

paperSchema.index({ year: -1, createdAt: -1 });

const Paper = mongoose.model("Paper", paperSchema);

export default Paper;
