import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateVocabularyQuestions,
  sanitizeQuestion,
  shuffleOptions,
  validateQuestionAnswer,
} from "../src/services/vocabularyQuestionService.js";

const items = [
  {
    _id: "1",
    type: "vocabulary",
    word: "Benevolent",
    meaning: "Kind and generous",
    synonyms: ["charitable"],
    antonyms: ["malevolent"],
    rootWord: "bene",
    rootMeaning: "good",
    difficulty: "medium",
    nextReviewAt: new Date(0),
  },
  { _id: "2", type: "vocabulary", word: "Taciturn", meaning: "Reserved in speech", difficulty: "medium" },
  { _id: "3", type: "vocabulary", word: "Garrulous", meaning: "Excessively talkative", difficulty: "medium" },
  { _id: "4", type: "vocabulary", word: "Obdurate", meaning: "Stubbornly refusing to change", difficulty: "medium" },
  { _id: "5", type: "vocabulary", word: "Prudent", meaning: "Wise and careful", difficulty: "easy" },
];

describe("Vocabulary question generation", () => {
  it("shuffles without changing option membership", () => {
    const values = ["a", "b", "c", "d"];
    const shuffled = shuffleOptions(values, () => 0.2);
    assert.deepEqual([...shuffled].sort(), values);
    assert.notEqual(shuffled, values);
  });

  it("builds balanced four-option MCQs", () => {
    const [question] = generateVocabularyQuestions({
      items: [items[0]],
      pool: items,
      mode: "mcq",
      limit: 1,
    });
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.ok(question.options.includes(question.correctAnswer));
  });

  it("hides answers from client-safe questions", () => {
    const [question] = generateVocabularyQuestions({ items, pool: items, mode: "mixed", limit: 1 });
    const safe = sanitizeQuestion(question);
    assert.equal("correctAnswer" in safe, false);
    assert.equal("acceptedAnswers" in safe, false);
  });

  it("validates answers case-insensitively", () => {
    const [question] = generateVocabularyQuestions({
      items: [items[0]],
      pool: items,
      mode: "typing",
      limit: 1,
    });
    assert.equal(validateQuestionAnswer(question, "benevolent"), true);
    assert.equal(validateQuestionAnswer(question, "garrulous"), false);
  });

  it("uses typed recall for fill-in-the-blank mode", () => {
    const [question] = generateVocabularyQuestions({
      items: [{ ...items[0], clozeSentence: "The Benevolent donor gave freely." }],
      pool: items,
      mode: "fill_blank",
      limit: 1,
    });
    assert.equal(question.interaction, "typing");
    assert.equal(question.questionType, "sentence_context");
    assert.equal(validateQuestionAnswer(question, "benevolent"), true);
  });
});
