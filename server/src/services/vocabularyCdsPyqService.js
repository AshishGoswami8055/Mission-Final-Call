/**
 * CDS English PYQ-style MCQ engine (AI + validated fallback).
 * Formats follow UPSC CDS English papers (CDS 1 2026 reference).
 */

import crypto from "node:crypto";
import OpenAI from "openai";
import VocabularyPracticeSession from "../models/VocabularyPracticeSession.js";
import { shuffleOptions } from "./vocabularyQuestionService.js";

/** Canonical CDS paper question types */
export const CDS_PYQ_TYPES = [
  "confusable_words",
  "idiom_meaning",
  "antonym_in_context",
  "word_meaning",
  "sentence_relationship",
  "synonym_in_context",
  "word_pair",
  "match_the_following",
  "one_word_substitution",
  "usage_in_sentences",
];

const LEGACY_TYPE_ALIASES = {
  similar_sounding: "confusable_words",
  idiom_mcq: "idiom_meaning",
  antonym_context: "antonym_in_context",
  synonym_context: "synonym_in_context",
  match_list: "match_the_following",
};

/** Practice modes routed through this engine */
export const CDS_PYQ_MODES = [
  "cds_pyq",
  "cds_confusable",
  "cds_idioms",
  "cds_antonyms",
  "cds_word_meaning",
  "cds_sentence_relationship",
  "cds_mixed_paper",
  "cds_full_english",
];

export const isCdsPyqPracticeMode = (mode = "") =>
  CDS_PYQ_MODES.includes(mode) || mode === "cds_pyq";

/** Formats allowed per drill mode */
export const FORMATS_FOR_MODE = {
  cds_pyq: [
    "confusable_words",
    "idiom_meaning",
    "antonym_in_context",
    "word_meaning",
    "sentence_relationship",
    "synonym_in_context",
    "word_pair",
    "match_the_following",
  ],
  cds_confusable: ["confusable_words"],
  cds_idioms: ["idiom_meaning"],
  cds_antonyms: ["antonym_in_context"],
  cds_word_meaning: ["word_meaning"],
  cds_sentence_relationship: ["sentence_relationship"],
  cds_mixed_paper: [
    "confusable_words",
    "idiom_meaning",
    "antonym_in_context",
    "word_meaning",
    "sentence_relationship",
  ],
  cds_full_english: CDS_PYQ_TYPES,
};

const DEFAULT_MODEL = "gpt-4o-mini";

const DIRECTIONS = {
  confusable_words:
    "Directions: In the following items similar sounding words are given, followed by sentences wherein in each sentence one of these words has been used, and underlined. You are required to select those sentences in which these words have been used most appropriately and mark your response on the Answer Sheet accordingly.",
  idiom_meaning:
    "Directions: Given below are some idioms/phrases followed by four alternative meanings to each. Select the most appropriate response from the options provided and mark your response on the Answer Sheet accordingly.",
  antonym_in_context:
    "Directions: Select the option that is opposite in meaning to the underlined word in the given sentences and mark your response on the Answer Sheet accordingly.",
  word_meaning:
    "Directions: Select the most appropriate meaning of the given words from the options provided and mark your response on the Answer Sheet accordingly.",
  sentence_relationship:
    "Directions: Given below are two statements. Select the option that best describes how the second sentence relates to the first.",
  synonym_in_context:
    "Directions: Select the option that is nearest in meaning to the underlined word in the given sentences and mark your response on the Answer Sheet accordingly.",
  word_pair:
    "Directions: In the following items, a pair of words is provided. You are required to select the option that most appropriately describes the meaning of both the words and mark your response on the Answer Sheet accordingly.",
  match_the_following:
    "Directions: Match List I with List II and select the answer using the code given below the Lists.",
  one_word_substitution:
    "Directions: Select the most appropriate one-word substitution from the options provided.",
  usage_in_sentences:
    "Directions: Select the option that best completes the sentence in CDS examination style.",
};

const SENTENCE_RELATIONSHIP_OPTIONS = [
  "contradicts the assertion of the first",
  "contrasts the assertion of the first",
  "confirms the assertion of the first",
  "qualifies the assertion of the first",
];

const CLASSIC_CONFUSABLE_SETS = [
  ["crops", "corps", "corpse"],
  ["censer", "censor", "censure"],
  ["pair", "pear", "pare"],
  ["fate", "fete", "faith"],
  ["bear", "bare", "bier"],
  ["tire", "tier", "tyre"],
  ["cite", "sight", "site"],
  ["raze", "raise", "rays"],
  ["idyll", "idle", "idol"],
  ["insure", "ensure", "unsure"],
];

const cleanText = (value) => String(value ?? "").trim();

const cleanList = (values = []) =>
  [...new Set((values || []).map((value) => cleanText(value)).filter(Boolean))];

export const normalizeCdsPyqType = (type = "") => {
  const key = cleanText(type).toLowerCase();
  return LEGACY_TYPE_ALIASES[key] || key;
};

const seededRandom = (seed) => {
  let state = Math.abs(Number(seed)) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const hashString = (value = "") => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Stable fingerprint to detect repeated questions across sessions */
export const questionFingerprint = (question = {}) => {
  const type = normalizeCdsPyqType(question.questionType || question.type);
  const parts = [type];
  if (question.wordSet?.length) parts.push(...question.wordSet.map(cleanText));
  if (question.word) parts.push(cleanText(question.word));
  if (question.idiom) parts.push(cleanText(question.idiom));
  if (question.sentence) parts.push(cleanText(question.sentence).slice(0, 100));
  if (question.s1) parts.push(cleanText(question.s1).slice(0, 80));
  if (question.s2) parts.push(cleanText(question.s2).slice(0, 80));
  if (question.prompt) parts.push(cleanText(question.prompt).slice(0, 80));
  return parts.join("|").toLowerCase();
};

/** Load fingerprints from recent CDS sessions so AI avoids immediate repeats */
export const loadRecentCdsPyqFingerprints = async (userId, maxFingerprints = 100) => {
  if (!userId) return [];
  const sessions = await VocabularyPracticeSession.find({
    userId,
    mode: { $in: CDS_PYQ_MODES },
  })
    .sort({ startedAt: -1 })
    .limit(10)
    .select("+questions")
    .lean();

  const fingerprints = [];
  const seen = new Set();
  for (const session of sessions) {
    for (const question of session.questions || []) {
      const fp = questionFingerprint(question);
      if (!seen.has(fp)) {
        seen.add(fp);
        fingerprints.push(fp);
        if (fingerprints.length >= maxFingerprints) return fingerprints;
      }
    }
  }
  return fingerprints;
};

const selectRotatedSeeds = (items = [], sessionSeed = "", attempt = 0) => {
  const rng = seededRandom(hashString(`${sessionSeed}:seed-rotate:${attempt}`));
  const shuffled = shuffleOptions([...items], rng);
  const start = Math.floor(rng() * Math.max(1, shuffled.length));
  const rotated = [...shuffled.slice(start), ...shuffled.slice(0, start)];
  return seedPayload(rotated).slice(0, 40);
};

const shufflePoolForSession = (pool = [], sessionSeed = "") => {
  const rng = seededRandom(hashString(`${sessionSeed}:pool`));
  return shuffleOptions([...pool], rng);
};

const dedupeQuestions = (questions = [], seenFingerprints = new Set()) => {
  const unique = [];
  for (const question of questions) {
    const fp = questionFingerprint(question);
    if (seenFingerprints.has(fp)) continue;
    seenFingerprints.add(fp);
    unique.push(question);
  }
  return unique;
};

const defaultMetadata = (sourceType = "ai_generated_cds_style") => ({
  exam: "CDS",
  examYear: null,
  paper: null,
  sourceType,
  sourcePaper: null,
  difficulty: "CDS",
});

const seedPayload = (items = []) =>
  items.slice(0, 40).map((item) => ({
    id: String(item._id),
    word: item.word,
    meaning: item.meaning,
    type: item.type || "vocabulary",
    synonyms: cleanList(item.synonyms).slice(0, 6),
    antonyms: cleanList(item.antonyms).slice(0, 6),
    example: item.example || item.clozeSentence || "",
    relatedWords: cleanList(item.relatedWords).slice(0, 6),
    rootWord: item.rootWord || "",
    tags: cleanList(item.tags).slice(0, 6),
  }));

const findSeedItem = (seeds, wordOrId) => {
  const needle = cleanText(wordOrId).toLowerCase();
  if (!needle) return seeds[0] || null;
  return (
    seeds.find((item) => String(item._id) === needle) ||
    seeds.find((item) => cleanText(item.word).toLowerCase() === needle) ||
    seeds.find((item) => cleanText(item.word).toLowerCase().includes(needle)) ||
    seeds[0] ||
    null
  );
};

const underlineInSentence = (sentence, word) => {
  const text = cleanText(sentence);
  const target = cleanText(word);
  if (!text || !target) return { text, underlined: target };
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b(${escaped})\\b`, "i");
  const match = text.match(regex);
  return { text, underlined: match?.[1] || target };
};

/** Validate AI/raw question before accepting */
export const validateCdsPyqQuestion = (raw = {}) => {
  const errors = [];
  const type = normalizeCdsPyqType(raw.type || raw.questionType);
  if (!CDS_PYQ_TYPES.includes(type)) {
    errors.push(`unsupported type: ${type}`);
    return { valid: false, errors, type };
  }

  const options = cleanList(raw.options).slice(0, 4);
  if (options.length !== 4) errors.push("requires exactly 4 options");
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) errors.push("duplicate options");

  let correctIndex =
    Number.isInteger(raw.correctOptionIndex) && raw.correctOptionIndex >= 0
      ? raw.correctOptionIndex
      : -1;
  const correctAnswer = cleanText(raw.correctAnswer);
  if (correctIndex < 0 && correctAnswer) {
    correctIndex = options.findIndex((o) => o.toLowerCase() === correctAnswer.toLowerCase());
  }
  if (correctIndex < 0 || correctIndex > 3) errors.push("correctOptionIndex out of range");
  if (!options[correctIndex]) errors.push("correct answer missing from options");

  if (type === "confusable_words") {
    const wordSet = cleanList(raw.wordSet || raw.focusWords);
    const sentences = Array.isArray(raw.sentences) ? raw.sentences : [];
    if (wordSet.length < 3) errors.push("confusable_words needs wordSet of 3");
    if (sentences.length < 3) errors.push("confusable_words needs 3 sentences");
  }
  if (type === "idiom_meaning" && !cleanText(raw.idiom || raw.prompt || raw.focusWord)) {
    errors.push("idiom_meaning needs idiom");
  }
  if (type === "antonym_in_context" || type === "synonym_in_context") {
    if (!cleanText(raw.sentence)) errors.push(`${type} needs sentence`);
    if (!cleanText(raw.targetWord || raw.underlinedWord)) errors.push(`${type} needs targetWord`);
  }
  if (type === "word_meaning" && !cleanText(raw.word || raw.prompt)) {
    errors.push("word_meaning needs word");
  }
  if (type === "sentence_relationship") {
    if (!cleanText(raw.s1)) errors.push("sentence_relationship needs s1");
    if (!cleanText(raw.s2)) errors.push("sentence_relationship needs s2");
  }
  if (type === "match_the_following") {
    if (!Array.isArray(raw.listI) || raw.listI.length < 4) errors.push("match_the_following needs listI");
    if (!Array.isArray(raw.listII) || raw.listII.length < 4) errors.push("match_the_following needs listII");
  }

  return { valid: errors.length === 0, errors, type, correctIndex, options };
};

const buildBaseQuestion = ({
  type,
  seed,
  prompt,
  options,
  correctAnswer,
  correctOptionIndex,
  sessionSeed,
  questionIndex,
  extras = {},
}) => {
  const canonicalType = normalizeCdsPyqType(type);
  const stableId = `cds-pyq:${canonicalType}:${seed?._id || "gen"}:${questionIndex}:${sessionSeed}`;
  const meta = { ...defaultMetadata(extras.sourceType || "ai_generated_cds_style"), ...extras.metadata };

  return {
    id: stableId,
    vocabularyId: seed?._id || null,
    questionType: canonicalType,
    interaction: "mcq",
    format: "cds_pyq",
    title: canonicalType.replace(/_/g, " "),
    directions: cleanText(extras.directions) || DIRECTIONS[canonicalType] || DIRECTIONS.word_meaning,
    prompt,
    options,
    correctAnswer,
    correctOptionIndex,
    acceptedAnswers: [correctAnswer],
    difficulty: "CDS",
    type: seed?.type || "vocabulary",
    exam: meta.exam,
    examYear: meta.examYear,
    paper: meta.paper,
    sourceType: meta.sourceType,
    sourcePaper: meta.sourcePaper,
    explanation: {
      word: seed?.word || extras.focusWord || extras.word || "",
      meaning: seed?.meaning || "",
      synonyms: cleanList(seed?.synonyms),
      antonyms: cleanList(seed?.antonyms),
      example: seed?.example || "",
      mnemonic: seed?.mnemonic || "",
      rootWord: seed?.rootWord || "",
      rootMeaning: seed?.rootMeaning || "",
      partOfSpeech: seed?.partOfSpeech || "",
      tags: cleanList([...(seed?.tags || []), "cds", canonicalType]),
      relatedWords: cleanList(seed?.relatedWords),
      examTag: "CDS English",
      rationale: extras.rationale || extras.explanation || "",
      optionNotes: extras.optionNotes || {},
    },
    ...extras.body,
  };
};

/** Deterministic option order + balanced correct-answer positions across session */
export const finalizeCdsPyqQuestions = (questions = [], sessionSeed = "cds") => {
  const rng = seededRandom(hashString(String(sessionSeed)));
  const targetPositions = questions.map((_, index) => index % 4);
  shuffleOptions(targetPositions, rng);

  return questions.map((question, index) => {
    const targetIndex = targetPositions[index];
    const options = [...question.options];
    const correct = question.correctAnswer;
    let correctIdx = options.findIndex((o) => o === correct);
    if (correctIdx < 0) correctIdx = 0;

    if (correctIdx !== targetIndex) {
      [options[correctIdx], options[targetIndex]] = [options[targetIndex], options[correctIdx]];
    }

    return {
      ...question,
      options,
      correctAnswer: correct,
      correctOptionIndex: targetIndex,
      questionNumber: index + 1,
    };
  });
};

const pickDistractors = (pool, seed, count = 3, exclude = new Set()) => {
  const rng = seededRandom(hashString(`${seed}:dist`));
  const candidates = shuffleOptions(
    pool
      .filter((item) => !exclude.has(String(item._id)))
      .flatMap((item) => [item.meaning, ...(item.synonyms || []), ...(item.antonyms || [])])
      .filter(Boolean),
    rng
  );
  const picked = [];
  for (const value of candidates) {
    if (picked.length >= count) break;
    if (!picked.some((row) => row.toLowerCase() === value.toLowerCase())) picked.push(value);
  }
  while (picked.length < count) picked.push(`Plausible CDS distractor ${picked.length + 1}`);
  return picked.slice(0, count);
};

/** ---------- Fallback builders ---------- */

const CONFUSABLE_CORRECT_COMBOS = [
  { answer: "1, 2 and 3", flags: [true, true, true] },
  { answer: "2 and 3 only", flags: [false, true, true] },
  { answer: "1 and 3 only", flags: [true, false, true] },
  { answer: "2 only", flags: [false, true, false] },
  { answer: "1 only", flags: [true, false, false] },
  { answer: "3 only", flags: [false, false, true] },
];

const buildConfusableWordsFallback = (seed, pool, questionIndex, sessionSeed) => {
  const rng = seededRandom(hashString(`${sessionSeed}:conf:${questionIndex}`));
  const offset = hashString(sessionSeed) % CLASSIC_CONFUSABLE_SETS.length;
  const setIndex = (questionIndex + offset) % CLASSIC_CONFUSABLE_SETS.length;
  const wordSet = [...CLASSIC_CONFUSABLE_SETS[setIndex]];
  const [w1, w2, w3] = wordSet;
  const combo = CONFUSABLE_CORRECT_COMBOS[Math.floor(rng() * CONFUSABLE_CORRECT_COMBOS.length)];
  const misuse = { [w1]: w2, [w2]: w1, [w3]: w2 };
  const templates = [
    { word: w1, correct: `What are the benefits of growing GM ${w1}?` },
    { word: w2, correct: `The volunteer ${w2} was organising a blood donation camp.` },
    { word: w3, correct: `He was sleeping like a ${w3}.` },
  ];
  const sentences = templates.map((template, index) => {
    const isCorrect = combo.flags[index];
    const underlined = isCorrect ? template.word : misuse[template.word] || template.word;
    const text = isCorrect
      ? template.correct
      : template.correct.replace(new RegExp(`\\b${template.word}\\b`, "i"), underlined);
    return { number: index + 1, text, underlined };
  });
  const options = shuffleOptions(
    [
      combo.answer,
      ...CONFUSABLE_CORRECT_COMBOS.filter((row) => row.answer !== combo.answer)
        .slice(0, 3)
        .map((row) => row.answer),
    ],
    rng
  ).slice(0, 4);
  return buildBaseQuestion({
    type: "confusable_words",
    seed,
    prompt: wordSet.join(", "),
    options,
    correctAnswer: combo.answer,
    correctOptionIndex: options.indexOf(combo.answer),
    sessionSeed,
    questionIndex,
    extras: {
      rationale: `Correct usage matches option “${combo.answer}” for ${wordSet.join(", ")}.`,
      body: {
        wordSet,
        focusWords: wordSet,
        sentences,
        questionStem:
          "In which of the sentences given above has / have the word(s) been used correctly?",
      },
    },
  });
};

const buildIdiomFallback = (seed, pool, questionIndex, sessionSeed) => {
  const item = seed.type === "idiom" ? seed : pool.find((row) => row.type === "idiom") || seed;
  const distractors = pickDistractors(pool, `${sessionSeed}:idiom:${questionIndex}`, 3, new Set([String(item._id)]));
  const options = [item.meaning, ...distractors];
  return buildBaseQuestion({
    type: "idiom_meaning",
    seed: item,
    prompt: item.word,
    options,
    correctAnswer: item.meaning,
    correctOptionIndex: 0,
    sessionSeed,
    questionIndex,
    extras: {
      focusWord: item.word,
      rationale: `The idiom “${item.word}” means ${item.meaning}.`,
      body: { idiom: item.word },
    },
  });
};

const buildAntonymFallback = (seed, pool, questionIndex, sessionSeed) => {
  const antonym = cleanList(seed.antonyms)[0];
  const sentence =
    seed.example ||
    `To him everything I did was considered ${seed.word.toLowerCase()}.`;
  const { text, underlined } = underlineInSentence(sentence, seed.word);
  const distractors = pickDistractors(pool, `${sessionSeed}:ant:${questionIndex}`, 3, new Set([String(seed._id)]));
  const correct = antonym || `opposite of ${seed.meaning}`;
  const options = [correct, ...distractors];
  return buildBaseQuestion({
    type: "antonym_in_context",
    seed,
    prompt: text,
    options,
    correctAnswer: correct,
    correctOptionIndex: 0,
    sessionSeed,
    questionIndex,
    extras: {
      focusWord: seed.word,
      rationale: `Opposite of “${seed.word}” in this context is “${correct}”.`,
      body: { sentence: text, targetWord: underlined, underlinedWord: underlined },
    },
  });
};

const buildWordMeaningFallback = (seed, pool, questionIndex, sessionSeed) => {
  const distractors = pickDistractors(pool, `${sessionSeed}:wm:${questionIndex}`, 3, new Set([String(seed._id)]));
  const options = [seed.meaning, ...distractors];
  return buildBaseQuestion({
    type: "word_meaning",
    seed,
    prompt: `${seed.word}:`,
    options,
    correctAnswer: seed.meaning,
    correctOptionIndex: 0,
    sessionSeed,
    questionIndex,
    extras: {
      focusWord: seed.word,
      word: seed.word,
      rationale: `“${seed.word}” means ${seed.meaning}.`,
      body: {
        word: seed.word,
        questionStem: "Select the most appropriate meaning of the given word.",
      },
    },
  });
};

const buildSentenceRelationshipFallback = (seed, pool, questionIndex, sessionSeed) => {
  const templates = [
    {
      s1: "Bananas are a rich source of potassium.",
      s2: "Doctors often recommend bananas for patients with low potassium levels.",
      correct: "confirms the assertion of the first",
    },
    {
      s1: "Delhi experiences extreme heat in May.",
      s2: "Shimla remains pleasantly cool during the same month.",
      correct: "contrasts the assertion of the first",
    },
    {
      s1: "Electric cars produce no exhaust emissions.",
      s2: "However, the electricity used to charge them may still come from fossil fuels.",
      correct: "qualifies the assertion of the first",
    },
    {
      s1: "The team claimed the project was complete.",
      s2: "An audit revealed several critical modules were still unfinished.",
      correct: "contradicts the assertion of the first",
    },
  ];
  const pick = templates[questionIndex % templates.length];
  const options = [...SENTENCE_RELATIONSHIP_OPTIONS];
  return buildBaseQuestion({
    type: "sentence_relationship",
    seed,
    prompt: "The second sentence:",
    options,
    correctAnswer: pick.correct,
    correctOptionIndex: options.indexOf(pick.correct),
    sessionSeed,
    questionIndex,
    extras: {
      rationale: `S2 ${pick.correct} S1 in standard CDS relationship logic.`,
      body: {
        s1: pick.s1,
        s2: pick.s2,
        questionStem: "The second sentence:",
      },
    },
  });
};

const buildSynonymContextFallback = (seed, pool, questionIndex, sessionSeed) => {
  const synonym = cleanList(seed.synonyms)[0] || seed.meaning;
  const sentence =
    seed.example || `The coach said his protégé was approaching the ${seed.word.toLowerCase()} of his career.`;
  const { text, underlined } = underlineInSentence(sentence, seed.word);
  const distractors = pickDistractors(pool, `${sessionSeed}:syn:${questionIndex}`, 3, new Set([String(seed._id)]));
  const options = [synonym, ...distractors];
  return buildBaseQuestion({
    type: "synonym_in_context",
    seed,
    prompt: text,
    options,
    correctAnswer: synonym,
    correctOptionIndex: 0,
    sessionSeed,
    questionIndex,
    extras: {
      rationale: `Nearest meaning of “${underlined}” here is “${synonym}”.`,
      body: { sentence: text, targetWord: underlined, underlinedWord: underlined },
    },
  });
};

const buildWordPairFallback = (seed, pool, questionIndex, sessionSeed) => {
  const partner = pool.find((item) => String(item._id) !== String(seed._id)) || {
    word: "Effect",
    meaning: "the result of an action",
  };
  const correct = `${seed.word} means ${seed.meaning} and ${partner.word} means ${partner.meaning}`;
  const options = [
    correct,
    `${seed.word} means ${partner.meaning} and ${partner.word} means ${seed.meaning}`,
    `${seed.word} means to delay and ${partner.word} means to accelerate`,
    `${seed.word} means a ceremony and ${partner.word} means a legal document`,
  ];
  return buildBaseQuestion({
    type: "word_pair",
    seed,
    prompt: `${seed.word} and ${partner.word}`,
    options,
    correctAnswer: correct,
    correctOptionIndex: 0,
    sessionSeed,
    questionIndex,
    extras: {
      rationale: correct,
      body: { focusWords: [seed.word, partner.word] },
    },
  });
};

const buildMatchFallback = (seeds, questionIndex, sessionSeed) => {
  const four = seeds.slice(0, 4);
  while (four.length < 4) {
    four.push({ word: `Term${four.length + 1}`, meaning: `Meaning ${four.length + 1}`, _id: null });
  }
  const listI = four.map((item, index) => ({
    key: String.fromCharCode(65 + index),
    text: item.word,
  }));
  const rng = seededRandom(hashString(`${sessionSeed}:match:${questionIndex}`));
  const order = shuffleOptions([0, 1, 2, 3], rng);
  const listII = order.map((sourceIndex, index) => ({
    key: String(index + 1),
    text: four[sourceIndex].meaning,
  }));
  const correctMap = four.map((item) => {
    const match = listII.find((row) => row.text === item.meaning);
    return Number(match?.key || 1);
  });
  const correctText = correctMap.join(" ");
  const wrongMaps = [
    [correctMap[1], correctMap[0], correctMap[3], correctMap[2]],
    [correctMap[3], correctMap[2], correctMap[1], correctMap[0]],
    [correctMap[2], correctMap[3], correctMap[0], correctMap[1]],
  ].map((row) => row.join(" "));
  const options = shuffleOptions([correctText, ...wrongMaps], rng);
  return buildBaseQuestion({
    type: "match_the_following",
    seed: four[0],
    prompt: "Match List I with List II",
    options,
    correctAnswer: correctText,
    correctOptionIndex: options.indexOf(correctText),
    sessionSeed,
    questionIndex,
    extras: {
      rationale: `Correct code is ${correctText}.`,
      body: { listI, listII, codeHeaders: ["A", "B", "C", "D"] },
    },
  });
};

const FALLBACK_BUILDERS = {
  confusable_words: buildConfusableWordsFallback,
  idiom_meaning: buildIdiomFallback,
  antonym_in_context: buildAntonymFallback,
  word_meaning: buildWordMeaningFallback,
  sentence_relationship: buildSentenceRelationshipFallback,
  synonym_in_context: buildSynonymContextFallback,
  word_pair: buildWordPairFallback,
  match_the_following: (seed, pool, index, sessionSeed) =>
    buildMatchFallback(pool, index, sessionSeed),
};

export const generateCdsPyqFallbackQuestions = ({
  items = [],
  limit = 10,
  mode = "cds_pyq",
  sessionSeed = "fallback",
  avoidFingerprints = [],
}) => {
  const pool = items.length ? items : [];
  if (!pool.length) return [];

  const allowed = FORMATS_FOR_MODE[mode] || FORMATS_FOR_MODE.cds_pyq;
  const builders = allowed
    .filter((type) => FALLBACK_BUILDERS[type])
    .map((type) => ({ type, build: FALLBACK_BUILDERS[type] }));

  const shuffledPool = shufflePoolForSession(pool, sessionSeed);
  const seen = new Set(avoidFingerprints);
  const questions = [];
  let guard = 0;
  const maxAttempts = limit * builders.length * 3;

  for (let index = 0; questions.length < limit && guard < maxAttempts; guard += 1) {
    const builderIndex = (index + guard) % builders.length;
    const { build } = builders[builderIndex];
    const seed = shuffledPool[(index + guard) % shuffledPool.length];
    const candidate = build(seed, shuffledPool, questions.length, `${sessionSeed}:${guard}`);
    const fp = questionFingerprint(candidate);
    if (seen.has(fp)) continue;
    seen.add(fp);
    questions.push(candidate);
    index += 1;
  }

  return finalizeCdsPyqQuestions(questions, sessionSeed);
};

/** ---------- AI generation ---------- */

const buildAiSystemPrompt = (allowedFormats) => `You generate UPSC CDS (Combined Defence Services) English examination questions.

CRITICAL RULES:
- Do NOT generate generic vocabulary quizzes like "What is the synonym of X?" or "What is the antonym of X?" without full CDS paper structure.
- Follow the structural style of actual CDS English papers (CDS 1 2026 reference).
- Use contextual sentences, confusable word sets, idioms, antonyms in context, definitions, sentence relationships.
- Exactly 4 plausible options per question. Distractors must be semantically close and realistic for CDS aspirants.
- Do NOT reveal the answer through wording. Randomize correctOptionIndex across questions.
- Generate ORIGINAL questions — do not copy copyrighted PYQ text verbatim.
- EVERY question in EVERY response must be NEW and unique for this session.
- Do NOT repeat confusable word sets, idioms, headwords, or sentence stems from the avoid list or from your prior outputs in this conversation.
- Vary confusable sets beyond crops/corps/corpse — invent or use diverse trios.
- sourceType must always be "ai_generated_cds_style" (never "pyq").
- Allowed types for this request: ${allowedFormats.join(", ")}.

Type schemas:
- confusable_words: wordSet[3], sentences[{number,text,underlined,isCorrect}], question stem about correct usage, options like "1 and 2 only"
- idiom_meaning: idiom, 4 meaning options
- antonym_in_context: sentence, targetWord (underlined in sentence), 4 opposite-meaning options
- word_meaning: word, 4 definition options
- sentence_relationship: s1, s2, options must be exactly the four CDS relationship phrases (contradicts/contrasts/confirms/qualifies the assertion of the first)
- synonym_in_context: sentence, targetWord, 4 nearest-meaning options
- word_pair: two words, 4 options defining BOTH words
- match_the_following: listI, listII, code options as "3 1 4 2"

Return JSON only.`;

const buildAiUserPrompt = ({
  seeds,
  limit,
  allowedFormats,
  varietyNonce,
  avoidFingerprints = [],
  attempt = 0,
}) =>
  `Generate ${limit} completely NEW CDS English MCQs for session ${varietyNonce} (attempt ${attempt + 1}).
Allowed types: ${allowedFormats.join(", ")}.
Mix types evenly. At least 60% must NOT be simple synonym/antonym flashcard style.

IMPORTANT: Do not repeat any question similar to these recent fingerprints:
${avoidFingerprints.slice(0, 40).map((fp) => `- ${fp}`).join("\n") || "- (none yet)"}

Use fresh confusable sets, new sentences, and different headwords/idioms than above.

Word bank seeds (rotate — do not use only the first few words):
${JSON.stringify(seeds, null, 2)}

Return:
{
  "questions": [
    {
      "type": "...",
      "seedWord": "...",
      "directions": "...",
      "wordSet": ["a","b","c"],
      "sentences": [{"number":1,"text":"...","underlined":"...","isCorrect":true}],
      "idiom": "...",
      "word": "...",
      "sentence": "...",
      "targetWord": "...",
      "s1": "...",
      "s2": "...",
      "listI": [{"key":"A","text":"..."}],
      "listII": [{"key":"1","text":"..."}],
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctOptionIndex": 0,
      "explanation": "..."
    }
  ]
}`;

const normalizeAiQuestion = (raw, seeds, questionIndex, sessionSeed) => {
  const validation = validateCdsPyqQuestion(raw);
  if (!validation.valid) return null;

  const type = validation.type;
  const seed = findSeedItem(seeds, raw.seedWord || raw.word || raw.idiom || raw.prompt);
  const options = validation.options;
  const correctAnswer = options[validation.correctIndex];

  const body = {};
  if (type === "confusable_words") {
    body.wordSet = cleanList(raw.wordSet || raw.focusWords);
    body.focusWords = body.wordSet;
    body.sentences = (raw.sentences || []).map((row, index) => ({
      number: Number(row.number) || index + 1,
      text: cleanText(row.text),
      underlined: cleanText(row.underlined || row.word),
    }));
    body.questionStem =
      cleanText(raw.question) ||
      "In which of the sentences given above has / have the word(s) been used correctly?";
  }
  if (type === "idiom_meaning") {
    body.idiom = cleanText(raw.idiom || raw.prompt);
  }
  if (type === "antonym_in_context" || type === "synonym_in_context") {
    body.sentence = cleanText(raw.sentence);
    body.targetWord = cleanText(raw.targetWord || raw.underlinedWord);
    body.underlinedWord = body.targetWord;
  }
  if (type === "word_meaning") {
    body.word = cleanText(raw.word || raw.prompt);
    body.questionStem = cleanText(raw.question) || "Select the most appropriate meaning of the given word.";
  }
  if (type === "sentence_relationship") {
    body.s1 = cleanText(raw.s1);
    body.s2 = cleanText(raw.s2);
    body.questionStem = cleanText(raw.question) || "The second sentence:";
  }
  if (type === "match_the_following") {
    body.listI = (raw.listI || []).map((row, index) => ({
      key: cleanText(row.key) || String.fromCharCode(65 + index),
      text: cleanText(row.text),
    }));
    body.listII = (raw.listII || []).map((row, index) => ({
      key: cleanText(row.key) || String(index + 1),
      text: cleanText(row.text),
    }));
    body.codeHeaders = ["A", "B", "C", "D"];
  }

  const prompt =
    type === "confusable_words"
      ? body.wordSet?.join(", ") || cleanText(raw.prompt)
      : type === "word_meaning"
        ? `${body.word}:`
        : type === "idiom_meaning"
          ? body.idiom
          : type === "sentence_relationship"
            ? body.questionStem
            : cleanText(raw.prompt || body.sentence || body.word || "CDS PYQ");

  return buildBaseQuestion({
    type,
    seed,
    prompt,
    options,
    correctAnswer,
    correctOptionIndex: validation.correctIndex,
    sessionSeed,
    questionIndex,
    extras: {
      rationale: cleanText(raw.explanation || raw.rationale),
      directions: cleanText(raw.directions),
      body,
    },
  });
};

const callOpenAiBatch = async ({
  openai,
  model,
  allowedFormats,
  seeds,
  limit,
  varietyNonce,
  avoidFingerprints,
  attempt,
}) => {
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildAiSystemPrompt(allowedFormats) },
      {
        role: "user",
        content: buildAiUserPrompt({
          seeds,
          limit,
          allowedFormats,
          varietyNonce,
          avoidFingerprints,
          attempt,
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.88,
    max_tokens: 12000,
  });

  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI returned an empty CDS PYQ response.");

  const parsed = JSON.parse(content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return rawQuestions;
};

export const generateCdsPyqAiQuestions = async ({
  items = [],
  limit = 10,
  mode = "cds_pyq",
  sessionSeed = "ai",
  avoidFingerprints = [],
}) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.code = "NO_OPENAI";
    throw error;
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_VOCAB_MODEL || process.env.OPENAI_ANALYSIS_MODEL || DEFAULT_MODEL;
  const count = Math.min(50, Math.max(1, Number(limit) || 10));
  const allowedFormats = FORMATS_FOR_MODE[mode] || FORMATS_FOR_MODE.cds_pyq;
  const varietyNonce = crypto.randomUUID();
  const seen = new Set(avoidFingerprints);
  const collected = [];

  for (let attempt = 0; attempt < 3 && collected.length < count; attempt += 1) {
    const need = count - collected.length;
    const seeds = selectRotatedSeeds(items, sessionSeed, attempt);
    const rawQuestions = await callOpenAiBatch({
      openai,
      model,
      allowedFormats,
      seeds,
      limit: need,
      varietyNonce,
      avoidFingerprints: [...seen],
      attempt,
    });

    const batch = rawQuestions
      .map((row, index) => normalizeAiQuestion(row, items, collected.length + index, sessionSeed))
      .filter(Boolean);

    for (const question of dedupeQuestions(batch, seen)) {
      collected.push(question);
      if (collected.length >= count) break;
    }
  }

  if (!collected.length) throw new Error("AI did not return usable CDS PYQ questions.");

  if (collected.length < count) {
    const filler = generateCdsPyqFallbackQuestions({
      items,
      limit: count - collected.length,
      mode,
      sessionSeed: `${sessionSeed}:fill`,
      avoidFingerprints: [...seen],
    });
    for (const question of filler) {
      if (collected.length >= count) break;
      collected.push(question);
    }
  }

  return finalizeCdsPyqQuestions(collected.slice(0, count), sessionSeed);
};

export const generateCdsPyqQuestions = async ({
  items = [],
  limit = 10,
  mode = "cds_pyq",
  preferAi = true,
  sessionSeed = `${Date.now()}`,
  avoidFingerprints = [],
} = {}) => {
  if (!items.length) {
    const error = new Error("Add vocabulary items before starting a CDS PYQ session.");
    error.statusCode = 400;
    throw error;
  }

  if (preferAi && process.env.OPENAI_API_KEY) {
    try {
      const aiQuestions = await generateCdsPyqAiQuestions({
        items,
        limit,
        mode,
        sessionSeed,
        avoidFingerprints,
      });
      if (aiQuestions.length) return { questions: aiQuestions, source: "ai" };
    } catch (error) {
      console.warn("[cds-pyq] AI generation failed, using fallback:", error.message);
    }
  }

  return {
    questions: generateCdsPyqFallbackQuestions({
      items,
      limit,
      mode,
      sessionSeed,
      avoidFingerprints,
    }),
    source: "fallback",
  };
};

/** Report answer-index distribution for tests */
export const answerIndexDistribution = (questions = []) => {
  const counts = [0, 0, 0, 0];
  for (const question of questions) {
    const index = question.correctOptionIndex ?? question.options.indexOf(question.correctAnswer);
    if (index >= 0 && index <= 3) counts[index] += 1;
  }
  return counts;
};
