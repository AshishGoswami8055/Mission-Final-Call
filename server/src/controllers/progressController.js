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
