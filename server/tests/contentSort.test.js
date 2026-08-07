import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sortSubjectContents } from "../src/utils/contentSort.js";

describe("contentSort", () => {
  it("sortSubjectContents prefers importSortOrder", () => {
    const items = [
      { _id: "b", title: "B", importSortOrder: 1 },
      { _id: "a", title: "A", importSortOrder: 0 },
    ];
    const sorted = sortSubjectContents(items, []);
    assert.deepEqual(sorted.map((row) => row._id), ["a", "b"]);
  });

  it("sortSubjectContents falls back to telegramMessageId", () => {
    const items = [
      { _id: "b", title: "B", telegramMessageId: 20 },
      { _id: "a", title: "A", telegramMessageId: 10 },
    ];
    const sorted = sortSubjectContents(items, []);
    assert.deepEqual(sorted.map((row) => row._id), ["a", "b"]);
  });
});
