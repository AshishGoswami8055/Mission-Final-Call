import mongoose from "mongoose";

/**
 * Maps a Subject to a configured Cloudinary account (cloud1, cloud2, ...).
 * If a subject has no entry here, the default cloud is used at upload time.
 */
const subjectCloudMappingSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      unique: true,
      index: true,
    },
    cloudType: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const SubjectCloudMapping = mongoose.model(
  "SubjectCloudMapping",
  subjectCloudMappingSchema
);

export default SubjectCloudMapping;
