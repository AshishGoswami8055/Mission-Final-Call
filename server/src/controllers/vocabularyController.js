import Vocabulary from "../models/Vocabulary.js";
import VocabularyReviewLog from "../models/VocabularyReviewLog.js";
import {
  commitVocabularyImport,
  parseVocabularyImportSource,
} from "../services/vocabularyImportService.js";
import { applySrsReview } from "../services/vocabularySrsService.js";
import { normalizeVocabularyPayload } from "../utils/vocabularyDomain.js";

const ALLOWED_TYPES = ["vocabulary", "idiom", "one_word"];
const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeType = (rawType) => {
  if (ALLOWED_TYPES.includes(rawType)) return rawType;
  return "vocabulary";
};

const typeFilter = (type) => {
  if (type === "vocabulary") {
    return [{ type: "vocabulary" }, { type: { $exists: false } }];
  }
  return [{ type }];
};

const extractAlpha = (word = "") => {
  const clean = String(word).trim();
  const first = clean.charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
};

export const getVocabulary = async (req, res) => {
  const {
    search = "",
    level = "",
    dueOnly = "false",
    sort = "due",
    page = 1,
    limit = 20,
    type = "vocabulary",
    alpha = "",
    all = "false",
    tag = "",
    rootWord = "",
    difficulty = "",
    examTag = "",
    status = "",
    recentlyWrong = "false",
    favorite = "",
  } = req.query;
  const normalizedType = normalizeType(type);
  const shouldReturnAll = String(all).toLowerCase() === "true";

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Math.min(100, Number(limit) || 20));

  const filter = {
    userId: req.user._id,
    archived: { $ne: true },
    $or: typeFilter(normalizedType),
  };
  if (level && ["new", "learning", "mastered"].includes(level)) {
    filter.level = level;
  }

  if (search) {
    const safeSearch = escapeRegex(search);
    filter.$and = [
      {
        $or: [
          { word: { $regex: safeSearch, $options: "i" } },
          { meaning: { $regex: safeSearch, $options: "i" } },
          { example: { $regex: safeSearch, $options: "i" } },
          { tags: { $elemMatch: { $regex: safeSearch, $options: "i" } } },
        ],
      },
    ];
  }

  if (alpha && /^[a-z]$/i.test(alpha)) {
    const condition = { word: { $regex: `^${alpha}`, $options: "i" } };
    if (filter.$and) filter.$and.push(condition);
    else filter.$and = [condition];
  }

  if (String(dueOnly).toLowerCase() === "true") {
    filter.nextReviewAt = { $lte: new Date() };
  }
  if (tag) filter.tags = String(tag);
  if (rootWord) filter.rootWord = { $regex: escapeRegex(rootWord), $options: "i" };
  if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
    filter.difficulty = difficulty;
  }
  if (examTag) filter.examTag = { $regex: escapeRegex(examTag), $options: "i" };
  if (status === "weak") {
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [{ wrongCount: { $gte: 2 } }, { confidence: { $lt: 35 } }],
      },
    ];
  }
  if (status === "mastered") filter.level = "mastered";
  if (status === "new") filter.level = "new";
  if (String(recentlyWrong).toLowerCase() === "true") {
    filter.lastWrongAt = { $ne: null };
  }
  if (favorite === "true") filter.favorite = true;

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    word: { word: 1 },
    due: { nextReviewAt: 1, createdAt: -1 },
    recentlyWrong: { lastWrongAt: -1, nextReviewAt: 1 },
    mistakes: { wrongCount: -1, lastWrongAt: -1 },
  };
  const sortBy = sortMap[sort] || sortMap.due;

  const total = await Vocabulary.countDocuments(filter);
  const query = Vocabulary.find(filter)
    .collation({ locale: "en", strength: 2, numericOrdering: true })
    .sort(sortBy);

  if (!shouldReturnAll) {
    query.skip((numericPage - 1) * numericLimit).limit(numericLimit);
  }

  const items = await query;
  const effectiveLimit = shouldReturnAll ? Math.max(total, 1) : numericLimit;
  const effectivePage = shouldReturnAll ? 1 : numericPage;
  const effectiveTotalPages = shouldReturnAll ? 1 : Math.max(1, Math.ceil(total / numericLimit));

  res.json({
    items: items.map((item) => ({
      ...item.toObject(),
      alphaLabel: extractAlpha(item.word),
    })),
    pagination: {
      page: effectivePage,
      limit: effectiveLimit,
      total,
      totalPages: effectiveTotalPages,
    },
  });
};

export const getVocabularyStats = async (req, res) => {
  const normalizedType = normalizeType(req.query.type);
  const scopeFilter = {
    userId: req.user._id,
    archived: { $ne: true },
    $or: typeFilter(normalizedType),
  };
  const [total, dueToday, weak, byLevel] = await Promise.all([
    Vocabulary.countDocuments(scopeFilter),
    Vocabulary.countDocuments({
      ...scopeFilter,
      nextReviewAt: { $lte: new Date() },
    }),
    Vocabulary.countDocuments({
      ...scopeFilter,
      archived: { $ne: true },
      $and: [
        {
          $or: [{ wrongCount: { $gte: 2 } }, { confidence: { $lt: 35 } }],
        },
      ],
    }),
    Vocabulary.aggregate([
      { $match: scopeFilter },
      { $group: { _id: "$level", count: { $sum: 1 } } },
    ]),
  ]);

  const levelMap = { new: 0, learning: 0, mastered: 0 };
  byLevel.forEach((row) => {
    if (row?._id && levelMap[row._id] !== undefined) {
      levelMap[row._id] = row.count;
    }
  });

  res.json({
    total,
    dueToday,
    weak,
    levels: levelMap,
  });
};

export const createVocabulary = async (req, res) => {
  const { word, meaning } = req.body;
  if (!word || !meaning) {
    return res.status(400).json({ message: "word and meaning are required" });
  }

  let item;
  try {
    item = await Vocabulary.create({
      userId: req.user._id,
      ...normalizeVocabularyPayload(req.body),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "This word already exists in the selected vocabulary category.",
      });
    }
    throw error;
  }

  res.status(201).json({
    ...item.toObject(),
    alphaLabel: extractAlpha(item.word),
  });
};

export const updateVocabulary = async (req, res) => {
  const item = await Vocabulary.findOne({ _id: req.params.id, userId: req.user._id });
  if (!item) return res.status(404).json({ message: "Vocabulary item not found" });

  Object.assign(item, normalizeVocabularyPayload(req.body, { partial: true }));

  try {
    await item.save();
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "This word already exists in the selected vocabulary category.",
      });
    }
    throw error;
  }
  res.json({
    ...item.toObject(),
    alphaLabel: extractAlpha(item.word),
  });
};

export const deleteVocabulary = async (req, res) => {
  const item = await Vocabulary.findOne({ _id: req.params.id, userId: req.user._id });
  if (!item) return res.status(404).json({ message: "Vocabulary item not found" });

  await item.deleteOne();
  res.json({ message: "Vocabulary item deleted" });
};

export const reviewVocabulary = async (req, res) => {
  const item = await Vocabulary.findOne({ _id: req.params.id, userId: req.user._id });
  if (!item) return res.status(404).json({ message: "Vocabulary item not found" });

  const result = String(req.body.result || "").toLowerCase();
  if (!["again", "good", "easy"].includes(result)) {
    return res.status(400).json({ message: "result must be one of: again, good, easy" });
  }

  const correct = result !== "again";
  await applySrsReview(item, {
    result,
    correct,
    responseTimeMs: Number(req.body.responseTimeMs) || 0,
    mode: String(req.body.mode || "legacy"),
  });
  await VocabularyReviewLog.create({
    userId: req.user._id,
    vocabularyId: item._id,
    mode: String(req.body.mode || "legacy"),
    questionType: String(req.body.questionType || "flashcard"),
    result,
    correct,
    responseTimeMs: Math.max(0, Number(req.body.responseTimeMs) || 0),
  });
  res.json({
    ...item.toObject(),
    alphaLabel: extractAlpha(item.word),
  });
};

export const getPracticeVocabulary = async (req, res) => {
  const normalizedType = normalizeType(req.query.type);
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
  const now = new Date();
  const dueItems = await Vocabulary.find({
    userId: req.user._id,
    $or: typeFilter(normalizedType),
    nextReviewAt: { $lte: now },
  })
    .sort({ nextReviewAt: 1, createdAt: -1 })
    .limit(limit);

  if (dueItems.length) {
    return res.json({ items: dueItems });
  }

  const fallback = await Vocabulary.find({
    userId: req.user._id,
    $or: typeFilter(normalizedType),
  })
    .sort({ updatedAt: -1 })
    .limit(limit);
  return res.json({
    items: fallback.map((item) => ({
      ...item.toObject(),
      alphaLabel: extractAlpha(item.word),
    })),
  });
};

export const importVocabulary = async (req, res) => {
  const normalizedType = normalizeType(req.body.type || req.query.type);
  if (!req.file) {
    return res.status(400).json({ message: "Upload a CSV, Excel, or image file" });
  }

  const entries = await parseVocabularyImportSource({
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    fileName: req.file.originalname,
    type: normalizedType,
  });
  if (!entries.length) {
    return res.status(400).json({ message: "No valid items found in uploaded file" });
  }
  const result = await commitVocabularyImport({
    userId: req.user._id,
    type: normalizedType,
    rows: entries,
  });

  return res.status(201).json({
    message: "Import completed",
    ...result,
  });
};

export const importVocabularyText = async (req, res) => {
  const normalizedType = normalizeType(req.body.type || req.query.type);
  const rawText = String(req.body.text || "").trim();
  if (!rawText) {
    return res.status(400).json({ message: "Please paste text to import" });
  }

  const entries = await parseVocabularyImportSource({
    text: rawText,
    type: normalizedType,
  });
  if (!entries.length) {
    return res.status(400).json({
      message:
        "No valid items found. Use format with lines like 'Word:', 'Meaning Hindi:', 'Meaning English:', 'Synonyms:', 'Sentence:'",
    });
  }

  const result = await commitVocabularyImport({
    userId: req.user._id,
    type: normalizedType,
    rows: entries,
  });

  return res.status(201).json({
    message: "Text import completed",
    ...result,
  });
};
