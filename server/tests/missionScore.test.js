import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreVideoCandidate } from "../src/services/missionGenerationService.js";

describe("missionGeneration scoreVideoCandidate", () => {
  const baseContent = {
    _id: "c1",
    createdAt: new Date(Date.now() - 20 * 86400000),
  };

  it("prefers unwatched videos", () => {
    const unwatched = scoreVideoCandidate({
      content: baseContent,
      subjectRate: 0.5,
      isCompleted: false,
      recentlyWatched: false,
      bucketCompletionAvg: 0.2,
    });
    const watched = scoreVideoCandidate({
      content: baseContent,
      subjectRate: 0.5,
      isCompleted: true,
      recentlyWatched: false,
      bucketCompletionAvg: 0.2,
    });
    assert.ok(unwatched.score > watched.score);
  });

  it("penalizes recently watched content", () => {
    const recent = scoreVideoCandidate({
      content: baseContent,
      subjectRate: 0.5,
      isCompleted: false,
      recentlyWatched: true,
      bucketCompletionAvg: 0.2,
    });
    const fresh = scoreVideoCandidate({
      content: baseContent,
      subjectRate: 0.5,
      isCompleted: false,
      recentlyWatched: false,
      bucketCompletionAvg: 0.2,
    });
    assert.ok(fresh.score > recent.score);
  });
});
