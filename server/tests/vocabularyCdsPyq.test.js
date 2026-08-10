import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  answerIndexDistribution,
  finalizeCdsPyqQuestions,
  generateCdsPyqFallbackQuestions,
  questionFingerprint,
  validateCdsPyqQuestion,
  CDS_PYQ_TYPES,
  FORMATS_FOR_MODE,
} from "../src/services/vocabularyCdsPyqService.js";
import { validateQuestionAnswer, sanitizeQuestion } from "../src/services/vocabularyQuestionService.js";

const items = [
  {
    _id: "1",
    type: "vocabulary",
    word: "Contemptuous",
    meaning: "showing disrespect",
    synonyms: ["disdainful"],
    antonyms: ["reverential"],
    example: "To him everything I did was considered contemptuous.",
    difficulty: "medium",
  },
  {
    _id: "2",
    type: "vocabulary",
    word: "Ephemeral",
    meaning: "lasting a very short time",
    antonyms: ["everlasting", "permanent"],
    synonyms: ["transient", "evanescent"],
    difficulty: "hard",
  },
  {
    _id: "3",
    type: "idiom",
    word: "Mealy-mouthed",
    meaning: "Lacking bravery to state things forthrightly",
    difficulty: "medium",
  },
  {
    _id: "4",
    type: "vocabulary",
    word: "Iconoclast",
    meaning: "Person who does not adhere to accepted beliefs and traditions",
    difficulty: "hard",
  },
  {
    _id: "5",
    type: "vocabulary",
    word: "Parsimonious",
    meaning: "unwilling to spend money",
    antonyms: ["extravagant"],
    difficulty: "hard",
  },
  {
    _id: "6",
    type: "vocabulary",
    word: "Ubiquitous",
    meaning: "present everywhere",
    difficulty: "hard",
  },
  {
    _id: "7",
    type: "vocabulary",
    word: "Equivocate",
    meaning: "use ambiguous language to conceal the truth",
    difficulty: "hard",
  },
  {
    _id: "8",
    type: "vocabulary",
    word: "Affect",
    meaning: "to influence",
    relatedWords: ["Effect"],
    antonyms: ["ignore"],
    difficulty: "medium",
  },
];

describe("CDS PYQ validation", () => {
  it("accepts confusable_words with required fields", () => {
    const result = validateCdsPyqQuestion({
      type: "confusable_words",
      wordSet: ["crops", "corps", "corpse"],
      sentences: [
        { number: 1, text: "GM crops", underlined: "crops" },
        { number: 2, text: "volunteer corps", underlined: "corps" },
        { number: 3, text: "like a corpse", underlined: "corpse" },
      ],
      options: ["2 and 3 only", "2 only", "1 and 3 only", "1, 2 and 3"],
      correctOptionIndex: 3,
    });
    assert.equal(result.valid, true);
    assert.equal(result.type, "confusable_words");
  });

  it("rejects malformed AI output missing options", () => {
    const result = validateCdsPyqQuestion({
      type: "word_meaning",
      word: "Iconoclast",
      options: ["a", "b"],
      correctOptionIndex: 0,
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("4 options")));
  });

  it("rejects sentence_relationship without s1/s2", () => {
    const result = validateCdsPyqQuestion({
      type: "sentence_relationship",
      options: [
        "contradicts the assertion of the first",
        "contrasts the assertion of the first",
        "confirms the assertion of the first",
        "qualifies the assertion of the first",
      ],
      correctOptionIndex: 2,
    });
    assert.equal(result.valid, false);
  });

  it("maps legacy similar_sounding alias", () => {
    const result = validateCdsPyqQuestion({
      type: "similar_sounding",
      wordSet: ["a", "b", "c"],
      sentences: [
        { number: 1, text: "one" },
        { number: 2, text: "two" },
        { number: 3, text: "three" },
      ],
      options: ["1 only", "2 only", "3 only", "1 and 2 only"],
      correctOptionIndex: 0,
    });
    assert.equal(result.type, "confusable_words");
  });
});

describe("CDS PYQ fallback generation", () => {
  it("generates all primary CDS formats for mixed paper", () => {
    const questions = generateCdsPyqFallbackQuestions({
      items,
      limit: 20,
      mode: "cds_mixed_paper",
      sessionSeed: "test-mixed",
    });
    assert.equal(questions.length, 20);
    const types = new Set(questions.map((q) => q.questionType));
    assert.ok(types.has("confusable_words"));
    assert.ok(types.has("idiom_meaning"));
    assert.ok(types.has("antonym_in_context"));
    assert.ok(types.has("word_meaning"));
    assert.ok(types.has("sentence_relationship"));
  });

  it("confusable_words has wordSet and three sentences", () => {
    const questions = generateCdsPyqFallbackQuestions({
      items,
      limit: 5,
      mode: "cds_confusable",
      sessionSeed: "test-conf",
    });
    for (const q of questions) {
      assert.equal(q.questionType, "confusable_words");
      assert.ok(q.wordSet?.length >= 3);
      assert.equal(q.sentences?.length, 3);
      assert.ok(q.questionStem?.includes("used correctly"));
    }
  });

  it("antonym_in_context preserves sentence context", () => {
    const questions = generateCdsPyqFallbackQuestions({
      items,
      limit: 3,
      mode: "cds_antonyms",
      sessionSeed: "test-ant",
    });
    for (const q of questions) {
      assert.equal(q.questionType, "antonym_in_context");
      assert.ok(q.sentence);
      assert.ok(q.targetWord || q.underlinedWord);
      assert.ok(!/What is the antonym/i.test(q.prompt || ""));
    }
  });

  it("word_meaning uses headword format not synonym quiz", () => {
    const [q] = generateCdsPyqFallbackQuestions({
      items,
      limit: 1,
      mode: "cds_word_meaning",
      sessionSeed: "test-wm",
    });
    assert.equal(q.questionType, "word_meaning");
    assert.ok(q.word || q.prompt);
    assert.ok(!/synonym/i.test(q.directions || ""));
  });

  it("sentence_relationship has S1, S2 and four relationship options", () => {
    const questions = generateCdsPyqFallbackQuestions({
      items,
      limit: 3,
      mode: "cds_sentence_relationship",
      sessionSeed: "test-sr",
    });
    for (const q of questions) {
      assert.equal(q.questionType, "sentence_relationship");
      assert.ok(q.s1);
      assert.ok(q.s2);
      assert.ok(q.options.some((o) => o.includes("confirms")));
      assert.ok(q.options.some((o) => o.includes("contradicts")));
    }
  });

  it("balances correct answer positions across session", () => {
    const questions = generateCdsPyqFallbackQuestions({
      items,
      limit: 20,
      mode: "cds_pyq",
      sessionSeed: "balance-test",
    });
    const counts = answerIndexDistribution(questions);
    assert.equal(counts.reduce((a, b) => a + b, 0), 20);
    for (const count of counts) {
      assert.ok(count >= 2, `each slot should appear at least twice, got ${counts}`);
    }
  });

  it("finalize keeps correct answer stable after option shuffle", () => {
    const raw = generateCdsPyqFallbackQuestions({
      items,
      limit: 4,
      mode: "cds_word_meaning",
      sessionSeed: "stable",
    });
    const again = finalizeCdsPyqQuestions(raw, "stable");
    for (let index = 0; index < raw.length; index += 1) {
      assert.equal(again[index].correctAnswer, raw[index].correctAnswer);
      assert.ok(again[index].options.includes(again[index].correctAnswer));
    }
  });

  it("sanitizes answers for client", () => {
    const [question] = generateCdsPyqFallbackQuestions({ items, limit: 1, sessionSeed: "san" });
    const safe = sanitizeQuestion(question);
    assert.equal("correctAnswer" in safe, false);
    assert.equal(safe.format, "cds_pyq");
    assert.equal(safe.sourceType, "ai_generated_cds_style");
  });

  it("validates selected option server-side", () => {
    const [question] = generateCdsPyqFallbackQuestions({ items, limit: 1, sessionSeed: "val" });
    assert.equal(validateQuestionAnswer(question, question.correctAnswer), true);
    assert.equal(validateQuestionAnswer(question, "definitely wrong option"), false);
  });

  it("generates different confusable sets across session seeds", () => {
    const a = generateCdsPyqFallbackQuestions({
      items,
      limit: 3,
      mode: "cds_confusable",
      sessionSeed: "session-a",
    });
    const b = generateCdsPyqFallbackQuestions({
      items,
      limit: 3,
      mode: "cds_confusable",
      sessionSeed: "session-b",
    });
    const fpsA = new Set(a.map(questionFingerprint));
    const fpsB = new Set(b.map(questionFingerprint));
    const overlap = [...fpsA].filter((fp) => fpsB.has(fp));
    assert.ok(overlap.length < fpsA.size, "expected mostly fresh questions per session seed");
  });

  it("dedupes against avoid fingerprints", () => {
    const first = generateCdsPyqFallbackQuestions({
      items,
      limit: 5,
      mode: "cds_mixed_paper",
      sessionSeed: "dedupe-a",
    });
    const avoid = first.map(questionFingerprint);
    const second = generateCdsPyqFallbackQuestions({
      items,
      limit: 5,
      mode: "cds_mixed_paper",
      sessionSeed: "dedupe-b",
      avoidFingerprints: avoid,
    });
    for (const question of second) {
      assert.equal(avoid.includes(questionFingerprint(question)), false);
    }
  });

  it("mode filters restrict formats", () => {
    assert.deepEqual(FORMATS_FOR_MODE.cds_confusable, ["confusable_words"]);
    assert.ok(FORMATS_FOR_MODE.cds_pyq.includes("sentence_relationship"));
    assert.ok(CDS_PYQ_TYPES.includes("sentence_relationship"));
  });
});
