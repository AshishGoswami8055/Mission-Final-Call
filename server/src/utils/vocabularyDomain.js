export const VOCABULARY_TYPES = ["vocabulary", "idiom", "one_word"];
export const VOCABULARY_DIFFICULTIES = ["easy", "medium", "hard"];

export const normalizeVocabularyType = (value, fallback = "vocabulary") =>
  VOCABULARY_TYPES.includes(value) ? value : fallback;

export const vocabularyTypeCondition = (type) => {
  if (!type || type === "all") return null;
  if (type === "vocabulary") {
    return [{ type: "vocabulary" }, { type: { $exists: false } }];
  }
  return [{ type }];
};

export const buildVocabularyScope = (
  userId,
  { type = "all", includeArchived = false } = {}
) => {
  const filter = { userId };
  if (!includeArchived) filter.archived = { $ne: true };
  const typeCondition = vocabularyTypeCondition(type);
  if (typeCondition) filter.$or = typeCondition;
  return filter;
};

export const normalizeStringList = (value) => {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return [
    ...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean)),
  ];
};

export const normalizeVocabularyPayload = (payload = {}, { partial = false } = {}) => {
  const output = {};
  const stringFields = [
    "word",
    "meaning",
    "example",
    "rootWord",
    "rootMeaning",
    "partOfSpeech",
    "mnemonic",
    "examTag",
    "clozeSentence",
    "source",
    "origin",
    "frequencyHint",
  ];
  const listFields = ["synonyms", "antonyms", "relatedWords", "tags"];

  for (const field of stringFields) {
    if (!partial || payload[field] != null) {
      output[field] = String(payload[field] || "").trim();
    }
  }
  for (const field of listFields) {
    if (!partial || payload[field] != null) {
      output[field] = normalizeStringList(payload[field]);
    }
  }

  if (!partial || payload.type != null) {
    output.type = normalizeVocabularyType(payload.type);
  }
  if (!partial || payload.difficulty != null) {
    output.difficulty = VOCABULARY_DIFFICULTIES.includes(payload.difficulty)
      ? payload.difficulty
      : "medium";
  }
  if (payload.level != null) {
    output.level = ["new", "learning", "mastered"].includes(payload.level)
      ? payload.level
      : "new";
  } else if (!partial) {
    output.level = "new";
  }
  if (payload.archived != null) output.archived = Boolean(payload.archived);
  if (payload.favorite != null) output.favorite = Boolean(payload.favorite);

  return output;
};

export const vocabularyDateKey = (value = new Date()) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
