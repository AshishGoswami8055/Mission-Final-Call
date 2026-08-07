import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findDuplicateImportRowIndexes,
  normalizeVocabularyImportRow,
  parseVocabularyCsv,
} from "../src/services/vocabularyImportService.js";

describe("Vocabulary Arena import parsing", () => {
  it("parses quoted CSV cells without splitting embedded commas", () => {
    const rows = parseVocabularyCsv(
      'word,meaning,synonyms,rootWord\n"Benevolent","Kind, generous","charitable, humane",bene'
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].meaning, "Kind, generous");
  });

  it("maps extended CDS fields and list values", () => {
    const row = normalizeVocabularyImportRow({
      Word: "Anachronism",
      Meaning: "Wrong historical placement",
      Antonyms: "contemporary, current",
      "Root Word": "chron",
      "Part of Speech": "noun",
      "Exam Tag": "CDS PYQ",
      Difficulty: "hard",
    });
    assert.equal(row.word, "Anachronism");
    assert.deepEqual(row.antonyms, ["contemporary", "current"]);
    assert.equal(row.rootWord, "chron");
    assert.equal(row.difficulty, "hard");
  });

  it("detects case-insensitive duplicates within an import", () => {
    const duplicates = findDuplicateImportRowIndexes([
      { type: "vocabulary", word: "Benevolent" },
      { type: "vocabulary", word: "benevolent" },
      { type: "idiom", word: "Benevolent" },
    ]);
    assert.deepEqual([...duplicates], [1]);
  });
});
