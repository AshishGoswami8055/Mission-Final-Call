import Tesseract from "tesseract.js";
import xlsx from "xlsx";
import Vocabulary from "../models/Vocabulary.js";

const normalizeCsv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ALLOWED_TYPES = ["vocabulary", "idiom", "one_word"];
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

const parseCsvRows = (raw) => {
  const text = String(raw || "").replace(/\r/g, "");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const splitLine = (line) => line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim());
  const headers = splitLine(lines[0]).map((header) => header.toLowerCase());
  const rows = lines.slice(1).map((line) => splitLine(line));

  return rows.map((cells) => {
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cells[idx] ?? "";
    });
    return row;
  });
};

const rowToEntry = (row, type) => {
  const get = (...keys) => {
    const found = keys.find((key) => row[key] != null && String(row[key]).trim());
    return found ? String(row[found]).trim() : "";
  };

  const word = get("word", "term", "idiom", "phrase", "title");
  const meaning = get("meaning", "definition", "substitution", "answer", "hindi", "translation");
  if (!word || !meaning) return null;

  return {
    userId: row.userId,
    type,
    word,
    meaning,
    example: get("example", "usage", "sentence"),
    synonyms: normalizeCsv(get("synonyms", "synonym", "syno")),
    tags: normalizeCsv(get("tags", "tag", "label", "labels", "alphabet", "alpha")),
    level: ["new", "learning", "mastered"].includes(get("level")) ? get("level") : "new",
  };
};

const parseExcelRows = (buffer) => {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json(sheet, { defval: "" });
};

const cleanOcrLine = (line) =>
  String(line || "")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractEntriesFromOcrText = (text, type) => {
  const lines = String(text || "")
    .split("\n")
    .map(cleanOcrLine)
    .filter(Boolean);

  const entries = [];
  let current = null;

  const isHeading = (line) => {
    if (!line || line.length > 80) return false;
    if (/^syno/i.test(line) || /^example/i.test(line) || /^[>•\-]/.test(line)) return false;
    if (/\d/.test(line)) return false;
    const words = line.split(" ");
    if (words.length > 6) return false;
    return /^[A-Za-z][A-Za-z()' -]*$/.test(words[0]);
  };

  for (const line of lines) {
    if (isHeading(line)) {
      if (current?.word && current?.meaning) entries.push(current);
      current = {
        type,
        word: line.split(" ").slice(0, 3).join(" ").trim(),
        meaning: "",
        example: "",
        synonyms: [],
        tags: [],
      };
      continue;
    }
    if (!current) continue;

    if (/^syno/i.test(line)) {
      const synText = line.replace(/^syno\s*:?\s*/i, "");
      current.synonyms = normalizeCsv(synText.replace(/\s+/g, " "));
      continue;
    }

    if (!current.meaning) {
      current.meaning = line;
      continue;
    }

    if (!current.example) {
      current.example = line.replace(/^[>•\-]\s*/, "");
    }
  }

  if (current?.word && current?.meaning) entries.push(current);
  return entries;
};

const parseSimpleLineBlocks = (text, type) => {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(cleanOcrLine)
    .filter(Boolean);

  const isAllCapsHeading = (line) =>
    line.length <= 40 && /^[A-Z][A-Z\s&.'-]+$/.test(line);
  const isLikelyTermOnly = (line) =>
    line.length <= 60 &&
    !/[.:]/.test(line) &&
    !/^(meaning|syno|sentence|example|word)\b/i.test(line);
  const isLikelyMeaning = (line) =>
    line.length >= 8 &&
    (/[a-z]/.test(line) || /[अ-ह]/.test(line)) &&
    !isAllCapsHeading(line);

  const entries = [];
  let idx = 0;
  while (idx < lines.length) {
    const current = lines[idx];
    if (isAllCapsHeading(current)) {
      idx += 1;
      continue;
    }

    const sameLineRow = current.match(/^([A-Za-z][A-Za-z0-9()'` -]{1,50})\s{2,}(.{6,})$/);
    if (sameLineRow) {
      entries.push({
        type,
        word: sameLineRow[1].trim(),
        meaning: sameLineRow[2].trim(),
        example: "",
        synonyms: [],
        tags: [],
        level: "new",
      });
      idx += 1;
      continue;
    }

    const next = lines[idx + 1];
    if (isLikelyTermOnly(current) && next && isLikelyMeaning(next)) {
      entries.push({
        type,
        word: current.trim(),
        meaning: next.trim(),
        example: "",
        synonyms: [],
        tags: [],
        level: "new",
      });
      idx += 2;
      continue;
    }
    idx += 1;
  }

  return entries;
};

const parsePastedStructuredText = (text, type) => {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());

  const entries = [];
  let current = {
    type,
    word: "",
    meaningHindi: "",
    meaningEnglish: "",
    meaning: "",
    example: "",
    synonyms: [],
    tags: [],
  };

  const flushCurrent = () => {
    const word = String(current.word || "").trim();
    const combinedMeaning = String(current.meaning || "").trim();
    const hindiMeaning = String(current.meaningHindi || "").trim();
    const englishMeaning = String(current.meaningEnglish || "").trim();

    const meaning =
      combinedMeaning ||
      [hindiMeaning, englishMeaning].filter(Boolean).join(" | ");

    if (!word || !meaning) return;

    entries.push({
      type,
      word,
      meaning,
      example: String(current.example || "").trim(),
      synonyms: Array.isArray(current.synonyms) ? current.synonyms : [],
      tags: Array.isArray(current.tags) ? current.tags : [],
      level: "new",
    });
  };

  for (const rawLine of lines) {
    if (!rawLine) continue;

    const line = rawLine.replace(/^[-*]\s*/, "");
    const match = line.match(/^([^:]+)\s*:\s*(.*)$/);
    if (!match) continue;

    const key = String(match[1] || "").toLowerCase().trim();
    const value = String(match[2] || "").trim();
    if (!value) continue;

    if (key === "word" || key === "idiom" || key === "phrase" || key === "term" || key === "one word") {
      if (current.word) flushCurrent();
      current = {
        type,
        word: value,
        meaningHindi: "",
        meaningEnglish: "",
        meaning: "",
        example: "",
        synonyms: [],
        tags: [],
      };
      continue;
    }

    if (key === "meaning hindi" || key === "hindi meaning") {
      current.meaningHindi = value;
      continue;
    }
    if (key === "meaning english" || key === "english meaning") {
      current.meaningEnglish = value;
      continue;
    }
    if (key === "meaning" || key === "definition") {
      current.meaning = value;
      continue;
    }
    if (key === "synonyms" || key === "synonym" || key === "syno") {
      current.synonyms = normalizeCsv(value);
      continue;
    }
    if (key === "sentence" || key === "example" || key === "usage") {
      current.example = value;
      continue;
    }
    if (key === "tags" || key === "tag") {
      current.tags = normalizeCsv(value);
    }
  }

  flushCurrent();
  if (entries.length) return entries;
  return parseSimpleLineBlocks(text, type);
};

const bulkUpsertVocabulary = async ({ userId, type, entries }) => {
  const normalized = entries
    .map((entry) => ({
      userId,
      type,
      word: String(entry.word || "").trim(),
      meaning: String(entry.meaning || "").trim(),
      example: String(entry.example || "").trim(),
      synonyms: Array.isArray(entry.synonyms) ? entry.synonyms.map((item) => String(item).trim()).filter(Boolean) : [],
      tags: Array.isArray(entry.tags) ? entry.tags.map((item) => String(item).trim()).filter(Boolean) : [],
      level: ["new", "learning", "mastered"].includes(entry.level) ? entry.level : "new",
      nextReviewAt: new Date(),
    }))
    .filter((entry) => entry.word && entry.meaning);

  if (!normalized.length) return { inserted: 0, updated: 0, skipped: 0 };

  let inserted = 0;
  let updated = 0;

  for (const item of normalized) {
    const existing = await Vocabulary.findOne({
      userId,
      type,
      word: item.word,
    });

    if (existing) {
      existing.meaning = item.meaning || existing.meaning;
      existing.example = item.example || existing.example;
      existing.synonyms = item.synonyms.length ? item.synonyms : existing.synonyms;
      existing.tags = item.tags.length ? item.tags : existing.tags;
      if (item.level) existing.level = item.level;
      await existing.save();
      updated += 1;
    } else {
      await Vocabulary.create(item);
      inserted += 1;
    }
  }

  return {
    inserted,
    updated,
    skipped: Math.max(0, entries.length - inserted - updated),
  };
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
  } = req.query;
  const normalizedType = normalizeType(type);
  const shouldReturnAll = String(all).toLowerCase() === "true";

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Math.min(100, Number(limit) || 20));

  const filter = { userId: req.user._id, $or: typeFilter(normalizedType) };
  if (level && ["new", "learning", "mastered"].includes(level)) {
    filter.level = level;
  }

  if (search) {
    filter.$and = [
      {
        $or: [
          { word: { $regex: search, $options: "i" } },
          { meaning: { $regex: search, $options: "i" } },
          { example: { $regex: search, $options: "i" } },
          { tags: { $elemMatch: { $regex: search, $options: "i" } } },
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

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    word: { word: 1 },
    due: { nextReviewAt: 1, createdAt: -1 },
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
  const scopeFilter = { userId: req.user._id, $or: typeFilter(normalizedType) };
  const [total, dueToday, byLevel] = await Promise.all([
    Vocabulary.countDocuments(scopeFilter),
    Vocabulary.countDocuments({
      ...scopeFilter,
      nextReviewAt: { $lte: new Date() },
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
    levels: levelMap,
  });
};

export const createVocabulary = async (req, res) => {
  const { word, meaning, example = "", synonyms = "", tags = "", level = "new", type = "vocabulary" } = req.body;
  if (!word || !meaning) {
    return res.status(400).json({ message: "word and meaning are required" });
  }

  const item = await Vocabulary.create({
    userId: req.user._id,
    type: normalizeType(type),
    word: String(word).trim(),
    meaning: String(meaning).trim(),
    example: String(example || "").trim(),
    synonyms: Array.isArray(synonyms) ? synonyms : normalizeCsv(synonyms),
    tags: Array.isArray(tags) ? tags : normalizeCsv(tags),
    level: ["new", "learning", "mastered"].includes(level) ? level : "new",
  });

  res.status(201).json({
    ...item.toObject(),
    alphaLabel: extractAlpha(item.word),
  });
};

export const updateVocabulary = async (req, res) => {
  const item = await Vocabulary.findOne({ _id: req.params.id, userId: req.user._id });
  if (!item) return res.status(404).json({ message: "Vocabulary item not found" });

  if (req.body.type && ALLOWED_TYPES.includes(req.body.type)) {
    item.type = req.body.type;
  }

  if (req.body.word != null) item.word = String(req.body.word).trim();
  if (req.body.meaning != null) item.meaning = String(req.body.meaning).trim();
  if (req.body.example != null) item.example = String(req.body.example).trim();
  if (req.body.synonyms != null) {
    item.synonyms = Array.isArray(req.body.synonyms) ? req.body.synonyms : normalizeCsv(req.body.synonyms);
  }
  if (req.body.tags != null) {
    item.tags = Array.isArray(req.body.tags) ? req.body.tags : normalizeCsv(req.body.tags);
  }
  if (req.body.level && ["new", "learning", "mastered"].includes(req.body.level)) {
    item.level = req.body.level;
  }

  await item.save();
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

  const now = new Date();
  let easeFactor = item.easeFactor || 2.5;
  let intervalDays = item.intervalDays || 0;

  if (result === "again") {
    intervalDays = 1;
    easeFactor = clamp(easeFactor - 0.2, 1.3, 2.8);
    item.level = "new";
  } else if (result === "good") {
    intervalDays = intervalDays <= 0 ? 2 : Math.round(intervalDays * easeFactor);
    easeFactor = clamp(easeFactor + 0.02, 1.3, 2.8);
    item.level = intervalDays >= 7 ? "learning" : item.level;
  } else if (result === "easy") {
    intervalDays = intervalDays <= 0 ? 4 : Math.round(intervalDays * (easeFactor + 0.35));
    easeFactor = clamp(easeFactor + 0.08, 1.3, 2.8);
    item.level = intervalDays >= 14 ? "mastered" : "learning";
  }

  const next = new Date(now);
  next.setDate(next.getDate() + clamp(intervalDays, 1, 180));

  item.easeFactor = easeFactor;
  item.intervalDays = intervalDays;
  item.reviewCount = (item.reviewCount || 0) + 1;
  item.lastReviewedAt = now;
  item.nextReviewAt = next;

  await item.save();
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

  const mime = String(req.file.mimetype || "").toLowerCase();
  const original = String(req.file.originalname || "").toLowerCase();
  const buffer = req.file.buffer;
  let entries = [];

  if (mime.includes("csv") || original.endsWith(".csv") || mime.includes("text/plain")) {
    const rows = parseCsvRows(buffer.toString("utf8"));
    entries = rows.map((row) => rowToEntry(row, normalizedType)).filter(Boolean);
  } else if (
    mime.includes("sheet") ||
    original.endsWith(".xlsx") ||
    original.endsWith(".xls")
  ) {
    const rows = parseExcelRows(buffer);
    entries = rows.map((row) => rowToEntry(row, normalizedType)).filter(Boolean);
  } else if (mime.startsWith("image/")) {
    const { data } = await Tesseract.recognize(buffer, "eng");
    const ocrText = data?.text || "";
    entries = extractEntriesFromOcrText(ocrText, normalizedType);
    if (!entries.length) {
      entries = parseSimpleLineBlocks(ocrText, normalizedType);
    }
  } else {
    return res.status(400).json({ message: "Unsupported file. Use CSV, Excel, or image" });
  }

  if (!entries.length) {
    return res.status(400).json({ message: "No valid items found in uploaded file" });
  }

  const result = await bulkUpsertVocabulary({
    userId: req.user._id,
    type: normalizedType,
    entries,
  });

  return res.status(201).json({
    message: "Import completed",
    detected: entries.length,
    ...result,
  });
};

export const importVocabularyText = async (req, res) => {
  const normalizedType = normalizeType(req.body.type || req.query.type);
  const rawText = String(req.body.text || "").trim();
  if (!rawText) {
    return res.status(400).json({ message: "Please paste text to import" });
  }

  const entries = parsePastedStructuredText(rawText, normalizedType);
  if (!entries.length) {
    return res.status(400).json({
      message:
        "No valid items found. Use format with lines like 'Word:', 'Meaning Hindi:', 'Meaning English:', 'Synonyms:', 'Sentence:'",
    });
  }

  const result = await bulkUpsertVocabulary({
    userId: req.user._id,
    type: normalizedType,
    entries,
  });

  return res.status(201).json({
    message: "Text import completed",
    detected: entries.length,
    ...result,
  });
};
