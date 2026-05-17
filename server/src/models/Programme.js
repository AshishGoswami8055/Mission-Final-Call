import mongoose from "mongoose";

const programmeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /** Stable folder segment under the CDS cycle, e.g. Golf_Batch — set at creation */
    folderSlug: {
      type: String,
      required: true,
      trim: true,
    },
    /** Which CDS written cycle this coaching folder belongs to (e.g. cds-1-2026). */
    cdsCycleId: {
      type: String,
      required: true,
      trim: true,
      default: "cds-1-2026",
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

programmeSchema.index({ cdsCycleId: 1, folderSlug: 1 }, { unique: true });

const Programme = mongoose.model("Programme", programmeSchema);

export default Programme;
