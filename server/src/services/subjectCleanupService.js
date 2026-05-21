import Chapter from "../models/Chapter.js";
import Content from "../models/Content.js";
import Progress from "../models/Progress.js";
import Subject from "../models/Subject.js";
import SubjectCloudMapping from "../models/SubjectCloudMapping.js";
import { destroyCloudinaryRaw, destroyCloudinaryVideo } from "../services/cloudinaryUploadService.js";

export const deleteSubjectTree = async (subjectId) => {
  const subject = await Subject.findById(subjectId);
  if (!subject) return { deleted: false };

  const chapters = await Chapter.find({ subjectId }).select("_id");
  const chapterIds = chapters.map((chapter) => chapter._id);

  const contents = await Content.find({ subjectId }).select("_id sourceType cloudType publicId");
  const contentIds = contents.map((content) => content._id);

  const cloudAssets = contents.filter((c) => c.sourceType === "cloudinary" && c.publicId);
  await Promise.allSettled(
    cloudAssets.map((c) =>
      c.type === "pdf"
        ? destroyCloudinaryRaw({ cloudType: c.cloudType, publicId: c.publicId })
        : destroyCloudinaryVideo({ cloudType: c.cloudType, publicId: c.publicId })
    )
  );

  await Progress.deleteMany({
    $or: [{ chapterId: { $in: chapterIds } }, { contentId: { $in: contentIds } }],
  });
  const contentResult = await Content.deleteMany({ subjectId });
  await Chapter.deleteMany({ subjectId });
  await SubjectCloudMapping.deleteOne({ subjectId });
  await subject.deleteOne();

  return {
    deleted: true,
    deletedContents: contentResult.deletedCount,
    deletedChapters: chapters.length,
  };
};
