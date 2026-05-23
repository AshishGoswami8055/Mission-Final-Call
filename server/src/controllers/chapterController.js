import Chapter from "../models/Chapter.js";
import Content from "../models/Content.js";
import Progress from "../models/Progress.js";
import Subject from "../models/Subject.js";
import { deleteContentsWithAssets } from "../services/contentCleanupService.js";

export const getChapters = async (req, res) => {
  const { subjectId } = req.query;
  const filter = subjectId ? { subjectId } : {};
  const chapters = await Chapter.find(filter)
    .collation({ locale: "en", numericOrdering: true })
    .sort({ chapterName: 1 });
  res.json(chapters);
};

export const getChapterStats = async (req, res) => {
  const contentStats = await Content.aggregate([
    {
      $group: {
        _id: "$chapterId",
        totalVideos: {
          $sum: { $cond: [{ $eq: ["$type", "video"] }, 1, 0] },
        },
        totalPdfs: {
          $sum: { $cond: [{ $eq: ["$type", "pdf"] }, 1, 0] },
        },
      },
    },
  ]);

  const completedStats = await Progress.aggregate([
    {
      $match: {
        userId: req.user._id,
        completed: true,
      },
    },
    {
      $group: {
        _id: "$chapterId",
        completedCount: { $sum: 1 },
      },
    },
  ]);

  const completedByChapter = new Map(
    completedStats.map((item) => [String(item._id), item.completedCount])
  );

  const payload = contentStats.map((item) => ({
    chapterId: String(item._id),
    totalVideos: item.totalVideos,
    totalPdfs: item.totalPdfs,
    completedCount: completedByChapter.get(String(item._id)) || 0,
  }));

  res.json(payload);
};

export const createChapter = async (req, res) => {
  const { subjectId, chapterName } = req.body;
  if (!subjectId || !chapterName) {
    return res.status(400).json({ message: "subjectId and chapterName are required" });
  }

  const subject = await Subject.findById(subjectId);
  if (!subject) return res.status(404).json({ message: "Subject not found" });

  const chapter = await Chapter.create({ subjectId, chapterName });
  res.status(201).json(chapter);
};

export const updateChapter = async (req, res) => {
  const chapter = await Chapter.findById(req.params.id);
  if (!chapter) return res.status(404).json({ message: "Chapter not found" });

  chapter.chapterName = req.body.chapterName ?? chapter.chapterName;
  if (req.body.subjectId) chapter.subjectId = req.body.subjectId;
  await chapter.save();
  res.json(chapter);
};

export const deleteChapter = async (req, res) => {
  const chapter = await Chapter.findById(req.params.id);
  if (!chapter) return res.status(404).json({ message: "Chapter not found" });

  await deleteContentsWithAssets({ chapterId: chapter._id });
  await Progress.deleteMany({ chapterId: chapter._id });
  await chapter.deleteOne();

  res.json({ message: "Chapter and related content deleted" });
};
