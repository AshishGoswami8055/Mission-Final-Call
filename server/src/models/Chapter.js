import mongoose from "mongoose";

const chapterSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    chapterName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

chapterSchema.index({ subjectId: 1, chapterName: 1 }, { unique: true });

const Chapter = mongoose.model("Chapter", chapterSchema);

export default Chapter;
