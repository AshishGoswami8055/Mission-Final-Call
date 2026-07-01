import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTelegramContentTitle,
  isLikelyLessonTitle,
  resolveTelegramMediaTitle,
} from "../src/services/telegramService.js";

describe("telegram media helpers", () => {
  it("buildTelegramContentTitle humanizes file names", () => {
    assert.equal(buildTelegramContentTitle("Lecture_01-Intro.mp4"), "Lecture 01 Intro");
  });

  it("isLikelyLessonTitle filters bot noise and bare URLs", () => {
    assert.equal(isLikelyLessonTitle("Download video"), false);
    assert.equal(isLikelyLessonTitle("https://t.me/join"), false);
    assert.equal(isLikelyLessonTitle("Polity L1 — Constitution"), true);
  });

  it("resolveTelegramMediaTitle prefers caption over file name", () => {
    assert.equal(
      resolveTelegramMediaTitle({ fileName: "VID_2024.mp4", caption: "Geography — Monsoon" }),
      "Geography — Monsoon"
    );
    assert.equal(resolveTelegramMediaTitle({ fileName: "lesson_02.mp4", caption: "" }), "lesson 02");
  });

  it("resolveTelegramMediaTitle falls back to file name when caption is noise", () => {
    assert.equal(
      resolveTelegramMediaTitle({ fileName: "lesson_02.mp4", caption: "Download video" }),
      "lesson 02"
    );
  });
});
