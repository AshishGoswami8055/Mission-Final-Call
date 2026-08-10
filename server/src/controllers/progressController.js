import Chapter from "../models/Chapter.js";
import Content from "../models/Content.js";
import Progress from "../models/Progress.js";

export const toggleCompleted = async (req, res) => {
  const { contentId } = req.params;
  const content = await Content.findById(contentId);
  if (!content) return res.status(404).json({ message: "Content not found" });

  const existing = await Progress.findOne({
    userId: req.user._id,
    contentId,
  });

  if (existing) {
    await existing.deleteOne();
    return res.json({ contentId, completed: false });
  }

  await Progress.create({
    userId: req.user._id,
    contentId,
    chapterId: content.chapterId,
    completed: true,
  });

  return res.json({ contentId, completed: true });
};

/** Mark every lesson in a subject complete (or clear all if already 100%). */
export const toggleSubjectCompleted = async (req, res) => {
  const { subjectId } = req.params;
  const contents = await Content.find({ subjectId }).select("_id chapterId");
  if (!contents.length) {
    return res.status(404).json({ message: "No lessons found in this subject." });
  }

  const contentIds = contents.map((item) => item._id);
  const existing = await Progress.find({
    userId: req.user._id,
    contentId: { $in: contentIds },
    completed: true,
  }).select("contentId");

  const allComplete = existing.length === contentIds.length;

  if (allComplete) {
    await Progress.deleteMany({ userId: req.user._id, contentId: { $in: contentIds } });
    return res.json({
      subjectId,
      completed: false,
      markedCount: 0,
      totalCount: contentIds.length,
    });
  }

  const existingSet = new Set(existing.map((entry) => String(entry.contentId)));
  const toCreate = contents
    .filter((item) => !existingSet.has(String(item._id)))
    .map((item) => ({
      userId: req.user._id,
      contentId: item._id,
      chapterId: item.chapterId,
      completed: true,
    }));

  if (toCreate.length) {
    await Progress.insertMany(toCreate, { ordered: false });
  }

  return res.json({
    subjectId,
    completed: true,
    markedCount: contentIds.length,
    totalCount: contentIds.length,
  });
};

export const getChapterProgress = async (req, res) => {
  const { chapterId } = req.params;
  const chapter = await Chapter.findById(chapterId);
  if (!chapter) return res.status(404).json({ message: "Chapter not found" });

  const [contents, completed] = await Promise.all([
    Content.find({ chapterId }).select("_id type"),
    Progress.find({
      userId: req.user._id,
      chapterId,
      completed: true,
    }).select("contentId"),
  ]);

  const completedSet = new Set(completed.map((item) => String(item.contentId)));
  const totalVideos = contents.filter((item) => item.type === "video").length;
  const totalPdfs = contents.filter((item) => item.type === "pdf").length;
  const completedCount = contents.filter((item) => completedSet.has(String(item._id))).length;
  const totalCount = contents.length;

  res.json({
    chapterId,
    totalVideos,
    totalPdfs,
    completedCount,
    totalCount,
    percent: totalCount ? Math.round((completedCount / totalCount) * 100) : 0,
  });
};
