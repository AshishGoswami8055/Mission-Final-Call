import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateVocabularyModePerformance,
  buildVocabularyReviewQueueHealth,
} from "../src/services/vocabularyArenaService.js";

describe("Vocabulary analytics aggregation", () => {
  it("aggregates accuracy by practice mode", () => {
    const rows = aggregateVocabularyModePerformance([
      { mode: "mcq", correct: true },
      { mode: "mcq", correct: false },
      { mode: "typing", correct: true },
    ]);
    assert.deepEqual(rows, [
      { mode: "mcq", total: 2, correct: 1, accuracy: 50 },
      { mode: "typing", total: 1, correct: 1, accuracy: 100 },
    ]);
  });

  it("classifies review queue health", () => {
    const now = new Date("2026-08-06T12:00:00Z");
    const health = buildVocabularyReviewQueueHealth([
      { nextReviewAt: new Date("2026-08-04T12:00:00Z") },
      { nextReviewAt: new Date("2026-08-06T10:00:00Z") },
      { nextReviewAt: new Date("2026-08-10T12:00:00Z") },
      { nextReviewAt: new Date("2026-09-01T12:00:00Z") },
    ], now);
    assert.deepEqual(health, { overdue: 1, dueToday: 2, nextSevenDays: 1 });
  });
});
