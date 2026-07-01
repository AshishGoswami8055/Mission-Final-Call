import mongoose from "mongoose";

const keyMomentSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    timecode: { type: String, default: "" },
  },
  { _id: false }
);

const contentAiCacheSchema = new mongoose.Schema(
  {
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
      unique: true,
      index: true,
    },
    shortSummary: { type: String, default: "" },
    keyMoments: { type: [keyMomentSchema], default: [] },
    contextNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

const ContentAiCache = mongoose.model("ContentAiCache", contentAiCacheSchema);

export default ContentAiCache;
