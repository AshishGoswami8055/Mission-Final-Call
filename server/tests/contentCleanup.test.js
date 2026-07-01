import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { destroyContentAssets } from "../src/services/contentCleanupService.js";
import { destroyPaperAssets } from "../src/services/paperCleanupService.js";

describe("contentCleanup", () => {
  it("destroyContentAssets no-ops for empty input", async () => {
    const result = await destroyContentAssets(null);
    assert.deepEqual(result, { cloudinary: 0, local: 0, errors: [] });
  });

  it("destroyContentAssets skips cloudinary when refs cannot be resolved", async () => {
    const result = await destroyContentAssets({
      _id: "c1",
      type: "video",
      sourceType: "cloudinary",
      videoUrl: "https://example.com/not-cloudinary.mp4",
      publicId: null,
      cloudType: null,
    });
    assert.equal(result.cloudinary, 0);
    assert.ok(result.errors.some((e) => /publicId/i.test(e)));
  });

  it("destroyPaperAssets no-ops for empty input", async () => {
    const result = await destroyPaperAssets(null);
    assert.deepEqual(result, { cloudinary: 0, local: 0, errors: [] });
  });

  it("destroyPaperAssets reports unresolved cloudinary refs", async () => {
    const result = await destroyPaperAssets({
      sourceType: "cloudinary",
      pdfUrl: "https://cdn.example/paper.pdf",
      publicId: null,
      cloudType: null,
    });
    assert.equal(result.cloudinary, 0);
    assert.ok(result.errors.length >= 1);
  });
});
