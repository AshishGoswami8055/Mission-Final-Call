import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCloudNameFromUrl,
  extractPublicIdFromCloudinaryUrl,
  resolveCloudinaryAssetRefs,
  resolvePaperCloudinaryAssetRefs,
} from "../src/utils/cloudinaryAsset.js";

describe("cloudinaryAsset", () => {
  it("extracts public id with version folder", () => {
    const url =
      "https://res.cloudinary.com/demo/video/upload/v1690000000/cds-journey/Main/Physics/videos/lesson_123.mp4";
    assert.equal(extractCloudNameFromUrl(url), "demo");
    assert.equal(
      extractPublicIdFromCloudinaryUrl(url),
      "cds-journey/Main/Physics/videos/lesson_123"
    );
  });

  it("extracts public id with transformation params", () => {
    const url =
      "https://res.cloudinary.com/demo/video/upload/w_640,c_fill/v123/cds-journey/foo/bar.mp4";
    assert.equal(extractPublicIdFromCloudinaryUrl(url), "cds-journey/foo/bar");
  });

  it("resolves content refs from legacy cloudinary URL only", () => {
    const refs = resolveCloudinaryAssetRefs({
      type: "video",
      sourceType: "cloudinary",
      videoUrl:
        "https://res.cloudinary.com/deqk0pnrq/video/upload/v1/cds-journey/foo/bar_video.mp4",
      publicId: null,
      cloudType: null,
    });
    assert.equal(refs.isCloudinary, true);
    assert.ok(refs.publicId);
    assert.equal(refs.resourceType, "video");
  });

  it("resolves paper raw asset refs", () => {
    const refs = resolvePaperCloudinaryAssetRefs({
      sourceType: "cloudinary",
      pdfUrl:
        "https://res.cloudinary.com/demo/raw/upload/v1/cds-journey/papers/PYQ/2024/paper_abc.pdf",
      publicId: null,
      cloudType: null,
    });
    assert.equal(refs.isCloudinary, true);
    assert.ok(refs.publicId.includes("cds-journey"));
    assert.equal(refs.resourceType, "raw");
  });
});
