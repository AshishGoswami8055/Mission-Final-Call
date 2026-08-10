import { answersMatch, calculateWeakWordScore } from "./vocabularySrsService.js";

export const QUESTION_TYPES = [
  "word_to_definition",
  "definition_to_word",
  "synonym",
  "antonym",
  "idiom_meaning",
  "one_word_substitution",
  "sentence_context",
  "root_family",
  "confusing_words",
  "homonym",
  "similar_sounding",
  "idiom_mcq",
  "antonym_context",
  "word_meaning",
  "word_pair",
  "synonym_context",
  "match_list",
  "confusable_words",
  "idiom_meaning",
  "antonym_in_context",
  "sentence_relationship",
  "synonym_in_context",
  "match_the_following",
  "usage_in_sentences",
];

export const PRACTICE_MODES = [
  "mcq",
  "reverse",
  "typing",
  "fill_blank",
  "weak",
  "roots",
  "exam",
  "timed",
  "mixed",
  "cds_pyq",
  "cds_confusable",
  "cds_idioms",
  "cds_antonyms",
  "cds_word_meaning",
  "cds_sentence_relationship",
  "cds_mixed_paper",
  "cds_full_english",
];

export const shuffleOptions = (values = [], random = Math.random) => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const cleanList = (values = []) =>
  [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];

const itemExplanation = (item) => ({
  word: item.word,
  meaning: item.meaning,
  synonyms: cleanList(item.synonyms),
  antonyms: cleanList(item.antonyms),
  example: item.example || item.clozeSentence || "",
  mnemonic: item.mnemonic || "",
  rootWord: item.rootWord || "",
  rootMeaning: item.rootMeaning || "",
  partOfSpeech: item.partOfSpeech || "",
  tags: cleanList(item.tags),
  relatedWords: cleanList(item.relatedWords),
  examTag: item.examTag || "",
});

const chooseQuestionType = (item, mode, index) => {
  if (mode === "reverse" || mode === "typing") return "definition_to_word";
  if (mode === "fill_blank") return "sentence_context";
  if (mode === "roots") return "root_family";
  if (item.type === "idiom") return "idiom_meaning";
  if (item.type === "one_word") return "one_word_substitution";

  const tagged = `${item.examTag || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
  if (tagged.includes("homonym")) return "homonym";
  if (tagged.includes("confus")) return "confusing_words";

  const eligible = ["word_to_definition", "definition_to_word"];
  if (item.synonyms?.length) eligible.push("synonym");
  if (item.antonyms?.length) eligible.push("antonym");
  if (item.clozeSentence || item.example) eligible.push("sentence_context");
  if (item.rootWord) eligible.push("root_family");
  return eligible[index % eligible.length];
};

const pickDistractors = ({
  item,
  pool,
  valueFor,
  correctAnswer,
  count = 3,
}) => {
  const sameType = pool.filter(
    (candidate) =>
      String(candidate._id) !== String(item._id) &&
      candidate.type === item.type &&
      candidate.difficulty === item.difficulty
  );
  const sameCategory = pool.filter(
    (candidate) =>
      String(candidate._id) !== String(item._id) &&
      candidate.type === item.type
  );
  const candidates = [...sameType, ...sameCategory, ...pool]
    .map(valueFor)
    .map((value) => String(value || "").trim())
    .filter((value) => value && !answersMatch(value, [correctAnswer]));
  return shuffleOptions(cleanList(candidates)).slice(0, count);
};

const sentenceWithBlank = (item) => {
  const sentence = String(item.clozeSentence || item.example || "").trim();
  if (!sentence) return `Choose the word that best matches: ${item.meaning}`;
  const escaped = String(item.word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const replaced = sentence.replace(new RegExp(`\\b${escaped}\\b`, "i"), "_____");
  return replaced === sentence ? `${sentence} — choose the best word.` : replaced;
};

const buildQuestion = (item, pool, questionType, mode) => {
  let prompt = "";
  let correctAnswer = "";
  let acceptedAnswers = [];
  let optionValue = (candidate) => candidate.word;
  let interaction = mode === "typing" ? "typing" : mode === "reverse" ? "reveal" : "mcq";

  switch (questionType) {
    case "definition_to_word":
      prompt = item.meaning;
      correctAnswer = item.word;
      acceptedAnswers = [item.word, ...(item.relatedWords || [])];
      optionValue = (candidate) => candidate.word;
      break;
    case "synonym":
      prompt = `Choose the closest synonym of “${item.word}”.`;
      correctAnswer = item.synonyms?.[0] || item.meaning;
      acceptedAnswers = item.synonyms?.length ? item.synonyms : [item.meaning];
      optionValue = (candidate) => candidate.synonyms?.[0] || candidate.meaning;
      break;
    case "antonym":
      prompt = `Choose the closest antonym of “${item.word}”.`;
      correctAnswer = item.antonyms?.[0] || item.meaning;
      acceptedAnswers = item.antonyms?.length ? item.antonyms : [item.meaning];
      optionValue = (candidate) => candidate.antonyms?.[0] || candidate.meaning;
      break;
    case "idiom_meaning":
      prompt = `What does the idiom “${item.word}” mean?`;
      correctAnswer = item.meaning;
      acceptedAnswers = [item.meaning];
      optionValue = (candidate) => candidate.meaning;
      break;
    case "one_word_substitution":
      prompt = `Choose the one-word substitution: ${item.meaning}`;
      correctAnswer = item.word;
      acceptedAnswers = [item.word];
      optionValue = (candidate) => candidate.word;
      break;
    case "sentence_context":
      prompt = sentenceWithBlank(item);
      correctAnswer = item.word;
      acceptedAnswers = [item.word, ...(item.relatedWords || [])];
      optionValue = (candidate) => candidate.word;
      interaction =
        mode === "fill_blank" || mode === "typing" ? "typing" : "mcq";
      break;
    case "root_family":
      prompt = item.rootMeaning
        ? `Which word belongs to the root “${item.rootWord}” (${item.rootMeaning})?`
        : `Which word belongs to the root family “${item.rootWord}”?`;
      correctAnswer = item.word;
      acceptedAnswers = [item.word];
      optionValue = (candidate) => candidate.word;
      break;
    case "homonym":
      prompt = `Select the correct meaning of “${item.word}” in CDS-style usage.`;
      correctAnswer = item.meaning;
      acceptedAnswers = [item.meaning];
      optionValue = (candidate) => candidate.meaning;
      break;
    case "confusing_words":
      prompt = sentenceWithBlank(item);
      correctAnswer = item.word;
      acceptedAnswers = [item.word];
      optionValue = (candidate) => candidate.word;
      break;
    case "word_to_definition":
    default:
      prompt = `Choose the correct meaning of “${item.word}”.`;
      correctAnswer = item.meaning;
      acceptedAnswers = [item.meaning];
      optionValue = (candidate) => candidate.meaning;
      break;
  }

  const distractors = pickDistractors({
    item,
    pool,
    valueFor: optionValue,
    correctAnswer,
  });
  const options =
    interaction === "mcq"
      ? shuffleOptions(cleanList([correctAnswer, ...distractors])).slice(0, 4)
      : [];
  const optionNotes = Object.fromEntries(
    options.map((option) => {
      if (answersMatch(option, [correctAnswer])) {
        return [option, "Correct: this directly matches the tested word or definition."];
      }
      const candidate = pool.find((row) => answersMatch(optionValue(row), [option]));
      return [
        option,
        candidate
          ? `Distractor: “${candidate.word}” means ${candidate.meaning}.`
          : "Distractor: it does not match the tested usage.",
      ];
    })
  );

  return {
    id: `${item._id}:${questionType}`,
    vocabularyId: item._id,
    questionType,
    interaction,
    prompt,
    options,
    correctAnswer,
    acceptedAnswers: cleanList(acceptedAnswers),
    explanation: { ...itemExplanation(item), optionNotes },
    difficulty: item.difficulty || "medium",
    type: item.type || "vocabulary",
  };
};

export const sanitizeQuestion = (question) => {
  const { correctAnswer, acceptedAnswers, ...safe } = question;
  return safe;
};

export const validateQuestionAnswer = (question, submittedAnswer) =>
  answersMatch(submittedAnswer, question.acceptedAnswers || [question.correctAnswer]);

export const prioritizeVocabularyItems = (items = [], { mode = "mixed", now = new Date() } = {}) =>
  [...items].sort((a, b) => {
    if (mode === "weak") {
      return calculateWeakWordScore(b, now) - calculateWeakWordScore(a, now);
    }
    const aDue = new Date(a.nextReviewAt || 0).getTime();
    const bDue = new Date(b.nextReviewAt || 0).getTime();
    const aOverdue = aDue <= now.getTime();
    const bOverdue = bDue <= now.getTime();
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    const weakDelta = calculateWeakWordScore(b, now) - calculateWeakWordScore(a, now);
    if (weakDelta) return weakDelta;
    return aDue - bDue;
  });

export const generateVocabularyQuestions = ({
  items = [],
  pool = items,
  mode = "mixed",
  limit = 10,
}) => {
  const prioritized = prioritizeVocabularyItems(items, { mode });
  const selected = prioritized.slice(0, Math.max(1, Number(limit) || 10));
  return selected.map((item, index) =>
    buildQuestion(item, pool, chooseQuestionType(item, mode, index), mode)
  );
};
