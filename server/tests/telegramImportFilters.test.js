import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLessonTitleKey,
  titleKeyFromTelegramMeta,
  isDuplicateTelegramMedia,
  evaluateTelegramImportSkip,
  createSubjectImportFilter,
} from "../src/utils/telegramImportFilters.js";

describe("telegram import filters", () => {
  it("normalizeLessonTitleKey strips extensions and punctuation", () => {
    assert.equal(normalizeLessonTitleKey("Lesson_01-Intro.mp4"), "lesson 01 intro");
    assert.equal(normalizeLessonTitleKey("A to Z — Day 1.pdf"), "a to z day 1");
  });

  it("titleKeyFromTelegramMeta prefers resolved caption title", () => {
    assert.equal(
      titleKeyFromTelegramMeta({
        fileName: "VID_123.mp4",
        caption: "English Breakfast — Idioms",
      }),
      "english breakfast idioms"
    );
  });

  it("isDuplicateTelegramMedia matches existing lesson titles", () => {
    const titleKeys = new Set(["english breakfast idioms"]);
    assert.equal(
      isDuplicateTelegramMedia(
        { fileName: "copy.mp4", caption: "English Breakfast — Idioms" },
        titleKeys
      ),
      true
    );
    assert.equal(
      isDuplicateTelegramMedia({ fileName: "new-topic.mp4", caption: "New Topic" }, titleKeys),
      false
    );
  });

  it("evaluateTelegramImportSkip ignores user-skipped message ids", () => {
    const subject = {
      _id: "sub1",
      telegramTopicId: 42,
      telegramSkippedMessageIds: [999],
      telegramImportVideos: true,
      telegramImportPdfs: true,
    };
    const filter = createSubjectImportFilter(subject, new Map());
    assert.equal(
      evaluateTelegramImportSkip({ messageId: 999, mediaType: "video", fileName: "x.mp4" }, filter)
        .skip,
      true
    );
  });

  it("evaluateTelegramImportSkip treats duplicate titles as non-actionable", () => {
    const subject = {
      _id: "sub1",
      telegramTopicId: 42,
      telegramSkippedMessageIds: [],
      telegramImportVideos: true,
      telegramImportPdfs: true,
    };
    const titleKeysBySubjectId = new Map([["sub1", new Set(["lesson one"]) ]]);
    const filter = createSubjectImportFilter(subject, titleKeysBySubjectId);
    const decision = evaluateTelegramImportSkip(
      { messageId: 1001, mediaType: "video", fileName: "lesson_one_copy.mp4", caption: "Lesson One" },
      filter
    );
    assert.equal(decision.skip, true);
    assert.equal(decision.persistSkip, true);
  });
});
