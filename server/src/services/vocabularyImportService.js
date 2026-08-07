import Tesseract from "tesseract.js";
import xlsx from "xlsx";
import Vocabulary from "../models/Vocabulary.js";
import {
  normalizeStringList,
  normalizeVocabularyPayload,
  normalizeVocabularyType,
  vocabularyTypeCondition,
} from "../utils/vocabularyDomain.js";

const IMPORT_FIELDS = [
  "word",
  "meaning",
  "example",
  "synonyms",
  "antonyms",
  "tags",
  "type",
  "rootWord",
  "rootMeaning",
  "partOfSpeech",
  "mnemonic",
  "examTag",
  "difficulty",
  "clozeSentence",
  "relatedWords",
  "source",
  "origin",
  "frequencyHint",
  "level",
];

const FIELD_ALIASES = {
  word: ["word", "term", "idiom", "phrase", "title", "one word"],
  meaning: ["meaning", "definition", "substitution", "answer", "translation", "hindi"],
  example: ["example", "usage", "sentence"],
  synonyms: ["synonyms", "synonym", "syno"],
  antonyms: ["antonyms", "antonym", "anto"],
  tags: ["tags", "tag", "labels", "label", "topic"],
  type: ["type", "category"],
  rootWord: ["rootword", "root word", "root", "prefix", "suffix"],
  rootMeaning: ["rootmeaning", "root meaning"],
  partOfSpeech: ["partofspeech", "part of speech", "pos"],
  mnemonic: ["mnemonic", "memory trick", "memory"],
  examTag: ["examtag", "exam tag", "exam", "pyq"],
  difficulty: ["difficulty"],
  level: ["level", "srs level"],
  clozeSentence: ["clozesentence", "cloze sentence", "fill blank", "context"],
  relatedWords: ["relatedwords", "related words", "related"],
  source: ["source"],
  origin: ["origin"],
  frequencyHint: ["frequencyhint", "frequency hint", "frequency"],
};

const canonicalHeader = (header) => {
  const key = String(header || "").toLowerCase().trim().replace(/[_-]+/g, " ");
  return (
    Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.includes(key))?.[0] || key
  );
};

const parseDelimitedLine = (line, delimiter) => {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

export const parseVocabularyCsv = (raw) => {
  const lines = String(raw || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 2) return [];
  const first = lines[0];
  const delimiter = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  const headers = parseDelimitedLine(first, delimiter).map(canonicalHeader);
  return lines.slice(1).map((line) => {
    const cells = parseDelimitedLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
};

const parseStructuredText = (raw, defaultType) => {
  const blocks = String(raw || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const entries = [];
  for (const block of blocks) {
    const row = {};
    for (const line of block.split("\n")) {
      const match = line.replace(/^[-*]\s*/, "").match(/^([^:]+):\s*(.*)$/);
      if (match) row[canonicalHeader(match[1])] = match[2].trim();
    }
    if (row.word || row.meaning) {
      entries.push({ ...row, type: row.type || defaultType });
      continue;
    }

    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length >= 2) {
      entries.push({ word: lines[0], meaning: lines[1], type: defaultType });
    }
  }
  return entries;
};

const parseOcrText = (raw, defaultType) => {
  const structured = parseStructuredText(raw, defaultType);
  if (structured.length) return structured;
  const lines = String(raw || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[|]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rows = [];
  for (let index = 0; index < lines.length - 1; index += 2) {
    if (lines[index].length <= 80 && lines[index + 1].length >= 3) {
      rows.push({ word: lines[index], meaning: lines[index + 1], type: defaultType });
    }
  }
  return rows;
};

export const normalizeVocabularyImportRow = (raw, defaultType = "vocabulary") => {
  const canonical = {};
  for (const [key, value] of Object.entries(raw || {})) {
    canonical[canonicalHeader(key)] = value;
  }
  const payload = normalizeVocabularyPayload(
    {
      ...canonical,
      type: normalizeVocabularyType(canonical.type, defaultType),
      synonyms: normalizeStringList(canonical.synonyms),
      antonyms: normalizeStringList(canonical.antonyms),
      tags: normalizeStringList(canonical.tags),
      relatedWords: normalizeStringList(canonical.relatedWords),
      source: canonical.source || "import",
    },
    { partial: false }
  );
  return Object.fromEntries(
    IMPORT_FIELDS.map((field) => [field, payload[field]]).filter(([, value]) => value != null)
  );
};

export const parseVocabularyImportSource = async ({
  buffer = null,
  mimeType = "",
  fileName = "",
  text = "",
  type = "vocabulary",
}) => {
  if (text) return parseStructuredText(text, type);
  if (!buffer) return [];
  const mime = String(mimeType).toLowerCase();
  const name = String(fileName).toLowerCase();
  if (mime.includes("csv") || mime.includes("text/plain") || name.endsWith(".csv")) {
    return parseVocabularyCsv(buffer.toString("utf8"));
  }
  if (mime.includes("sheet") || name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames?.[0]];
    return sheet ? xlsx.utils.sheet_to_json(sheet, { defval: "" }) : [];
  }
  if (mime.startsWith("image/")) {
    const { data } = await Tesseract.recognize(buffer, "eng");
    return parseOcrText(data?.text || "", type);
  }
  const error = new Error("Unsupported file. Use CSV, Excel, text, or an image.");
  error.statusCode = 400;
  throw error;
};

const wordKey = (type, word) =>
  `${normalizeVocabularyType(type)}:${String(word || "").trim().toLowerCase()}`;

export const findDuplicateImportRowIndexes = (rows = [], defaultType = "vocabulary") => {
  const seen = new Set();
  const duplicates = new Set();
  rows.forEach((row, index) => {
    const key = wordKey(row.type || defaultType, row.word);
    if (!row.word) return;
    if (seen.has(key)) duplicates.add(index);
    else seen.add(key);
  });
  return duplicates;
};

export const previewVocabularyImport = async ({ userId, rawRows, type = "vocabulary" }) => {
  const normalized = rawRows.map((row) => normalizeVocabularyImportRow(row, type));
  const existing = await Vocabulary.find({ userId })
    .select("type word")
    .lean();
  const existingKeys = new Set(existing.map((row) => wordKey(row.type || "vocabulary", row.word)));
  const duplicateIndexes = findDuplicateImportRowIndexes(normalized, type);

  const rows = normalized.map((row, index) => {
    const errors = [];
    if (!row.word) errors.push("Word is required.");
    if (!row.meaning) errors.push("Meaning is required.");
    if (row.word?.length > 160) errors.push("Word is too long.");
    if (row.meaning?.length > 2000) errors.push("Meaning is too long.");
    const key = wordKey(row.type, row.word);
    if (duplicateIndexes.has(index)) errors.push("Duplicate row in this import.");

    return {
      rowNumber: index + 1,
      data: row,
      status: errors.length
        ? "error"
        : existingKeys.has(key)
          ? "update"
          : "new",
      errors,
    };
  });
  return {
    rows,
    summary: {
      detected: rows.length,
      valid: rows.filter((row) => !row.errors.length).length,
      new: rows.filter((row) => row.status === "new").length,
      updates: rows.filter((row) => row.status === "update").length,
      errors: rows.filter((row) => row.errors.length).length,
    },
  };
};

export const commitVocabularyImport = async ({ userId, rows, type = "vocabulary" }) => {
  const preview = await previewVocabularyImport({ userId, rawRows: rows, type });
  const validRows = preview.rows.filter((row) => !row.errors.length);
  let inserted = 0;
  let updated = 0;
  const errors = preview.rows
    .filter((row) => row.errors.length)
    .map(({ rowNumber, errors: rowErrors }) => ({ rowNumber, errors: rowErrors }));

  for (const row of validRows) {
    const item = row.data;
    const query = {
      userId,
      word: { $regex: `^${String(item.word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    };
    const typeCondition = vocabularyTypeCondition(item.type);
    if (typeCondition) query.$or = typeCondition;
    const existing = await Vocabulary.findOne(query);
    if (existing) {
      for (const [field, value] of Object.entries(item)) {
        const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
        if (hasValue) existing[field] = value;
      }
      await existing.save();
      updated += 1;
    } else {
      await Vocabulary.create({
        userId,
        ...item,
        nextReviewAt: new Date(),
      });
      inserted += 1;
    }
  }

  return {
    detected: preview.summary.detected,
    inserted,
    updated,
    skipped: errors.length,
    errors,
  };
};
