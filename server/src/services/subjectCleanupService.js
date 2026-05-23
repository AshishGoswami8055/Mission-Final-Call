import Chapter from "../models/Chapter.js";
import Content from "../models/Content.js";
import Progress from "../models/Progress.js";
import Subject from "../models/Subject.js";
import SubjectCloudMapping from "../models/SubjectCloudMapping.js";
import {
  deleteContentsWithAssets,
  destroyContentsAssets,
} from "./contentCleanupService.js";

export const deleteSubjectTree = async (subjectId) => {
  const subject = await Subject.findById(subjectId);
  if (!subject) return { deleted: false };

  const chapters = await Chapter.find({ subjectId }).select("_id");
  const chapterIds = chapters.map((chapter) => chapter._id);

  const contents = await Content.find({ subjectId }).select(
    "_id type sourceType filePath publicId cloudType chapterId"
  );

  const assets = await destroyContentsAssets(contents);

  const contentIds = contents.map((content) => content._id);
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
    destroyedCloudinary: assets.cloudinary,
    removedLocalFiles: assets.local,
  };
};
