import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateVocabularySessionMetrics } from "../src/services/vocabularySessionService.js";

describe("Vocabulary practice session scoring", () => {
  it("scores correct, wrong, skipped and response time", () => {
    const metrics = calculateVocabularySessionMetrics([
      { correct: true, skipped: false, responseTimeMs: 1000 },
      { correct: false, skipped: false, responseTimeMs: 3000 },
      { correct: false, skipped: true, responseTimeMs: 2000 },
      { correct: true, skipped: false, responseTimeMs: 2000 },
    ]);
    assert.deepEqual(metrics, {
      correctAnswers: 2,
      wrongAnswers: 2,
      skippedQuestions: 1,
      averageResponseTime: 2000,
      accuracy: 50,
    });
  });

  it("handles empty sessions", () => {
    assert.deepEqual(calculateVocabularySessionMetrics([]), {
      correctAnswers: 0,
      wrongAnswers: 0,
      skippedQuestions: 0,
      averageResponseTime: 0,
      accuracy: 0,
    });
  });
});
