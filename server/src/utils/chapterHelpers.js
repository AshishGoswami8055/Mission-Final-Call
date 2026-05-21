import Chapter from "../models/Chapter.js";

/** Find or create a chapter under a subject (case-insensitive name match). */
export const getOrCreateChapterForSubject = async (subjectId, chapterName) => {
  const normalized = String(chapterName || "").trim();
  if (!normalized) throw new Error("Chapter name is empty");

  const exact = await Chapter.findOne({ subjectId, chapterName: normalized });
  if (exact) return exact;

  const siblings = await Chapter.find({ subjectId }).select("chapterName");
  const key = normalized.toLowerCase();
  const ci = siblings.find((c) => c.chapterName.trim().toLowerCase() === key);
  if (ci) return ci;

  try {
    return await Chapter.create({ subjectId, chapterName: normalized });
  } catch (err) {
    if (err?.code === 11000) {
      return Chapter.findOne({ subjectId, chapterName: normalized });
    }
    throw err;
  }
};
