import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  answersMatch,
  calculateSrsUpdate,
  calculateWeakWordScore,
  normalizeAnswerText,
} from "../src/services/vocabularySrsService.js";

describe("Vocabulary Arena SRS", () => {
  const now = new Date("2026-08-06T10:00:00.000Z");

  it("normalizes case and punctuation for typed recall", () => {
    assert.equal(normalizeAnswerText("  One-word’s_Test! "), "one words test");
    assert.equal(answersMatch("Benevolent.", ["benevolent"]), true);
  });

  it("Again strongly resets confidence and schedules tomorrow", () => {
    const update = calculateSrsUpdate(
      { easeFactor: 2.5, intervalDays: 20, confidence: 82, level: "mastered" },
      { result: "again", correct: false, mode: "typing" },
      now
    );
    assert.equal(update.intervalDays, 1);
    assert.equal(update.confidence, 58);
    assert.equal(update.level, "new");
    assert.equal(update.wrongCount, 1);
    assert.equal(update.nextReviewAt.toISOString(), "2026-08-07T10:00:00.000Z");
  });

  it("Good and Easy progress deterministically", () => {
    const good = calculateSrsUpdate(
      { easeFactor: 2.5, intervalDays: 2, confidence: 30, level: "new" },
      { result: "good", correct: true, responseTimeMs: 6000 },
      now
    );
    const easy = calculateSrsUpdate(
      { easeFactor: 2.5, intervalDays: 4, confidence: 60, level: "learning" },
      { result: "easy", correct: true, responseTimeMs: 4000 },
      now
    );
    assert.equal(good.intervalDays, 5);
    assert.equal(good.confidence, 42);
    assert.equal(easy.intervalDays, 11);
    assert.equal(easy.confidence, 80);
  });

  it("weak score prioritizes repeated and recent mistakes", () => {
    const stable = calculateWeakWordScore({
      correctCount: 8,
      wrongCount: 0,
      confidence: 90,
      nextReviewAt: new Date("2026-08-10"),
    }, now);
    const weak = calculateWeakWordScore({
      correctCount: 2,
      wrongCount: 5,
      confidence: 20,
      lastWrongAt: new Date("2026-08-05"),
      nextReviewAt: new Date("2026-08-01"),
    }, now);
    assert.ok(weak > stable);
  });
});
