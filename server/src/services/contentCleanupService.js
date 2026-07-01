import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Content from "../models/Content.js";
import Progress from "../models/Progress.js";
import { resolveCloudinaryAssetRefs } from "../utils/cloudinaryAsset.js";
import { destroyCloudinaryAsset } from "./cloudinaryUploadService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, "..", "..", "uploads");

const CONTENT_ASSET_FIELDS =
  "_id type sourceType filePath publicId cloudType videoUrl url thumbnail chapterId subjectId";

/**
 * Remove a file stored under server/uploads from a relative path (e.g. uploads/...).
 */
export const removeLocalUploadFile = (relativeFilePath) => {
  if (!relativeFilePath) return;
  const trimmed = String(relativeFilePath).replace(/^\/+/, "");
  if (/^https?:\/\//i.test(trimmed)) return;
  const absolute = path.resolve(__dirname, "..", "..", trimmed);
  if (absolute.startsWith(uploadRoot) && fs.existsSync(absolute)) {
    try {
      fs.unlinkSync(absolute);
    } catch (err) {
      console.warn(`[cleanup] failed to remove local file ${absolute}:`, err.message);
    }
  }
};

/**
 * Delete Cloudinary + local files for one content document. Safe to call before DB delete.
 */
export const destroyContentAssets = async (content) => {
  if (!content) return { cloudinary: 0, local: 0, errors: [] };

  let cloudinary = 0;
  let local = 0;
  const errors = [];
  const refs = resolveCloudinaryAssetRefs(content);

  if (refs.isCloudinary && refs.publicId && refs.cloudType) {
    const result = await destroyCloudinaryAsset({
      cloudType: refs.cloudType,
      publicId: refs.publicId,
      resourceType: refs.resourceType,
    });
    if (result?.ok) cloudinary += 1;
    else if (!result?.skipped) errors.push(result?.error || "Cloudinary destroy failed");
  } else if (refs.isCloudinary) {
    errors.push("Cloudinary URL found but publicId could not be resolved");
    console.warn(
      `[cleanup] content ${content._id} has Cloudinary source but no resolvable publicId`
    );
  }

  if (refs.thumbnailAsset?.publicId && refs.thumbnailAsset?.cloudType) {
    const thumb = await destroyCloudinaryAsset({
      cloudType: refs.thumbnailAsset.cloudType,
      publicId: refs.thumbnailAsset.publicId,
      resourceType: "image",
    });
    if (thumb?.ok) cloudinary += 1;
  }

  if (content.filePath || content.sourceType === "upload") {
    removeLocalUploadFile(content.filePath);
    local += 1;
  }

  return { cloudinary, local, errors };
};

/** Destroy remote/local assets for many content rows. */
export const destroyContentsAssets = async (contents = []) => {
  const results = await Promise.allSettled(contents.map((c) => destroyContentAssets(c)));
  let cloudinary = 0;
  let local = 0;
  const errors = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      cloudinary += r.value.cloudinary || 0;
      local += r.value.local || 0;
      if (r.value.errors?.length) errors.push(...r.value.errors);
    } else {
      errors.push(r.reason?.message || "Asset cleanup failed");
    }
  }
  return { cloudinary, local, total: contents.length, errors };
};

/**
 * Find contents matching filter, remove Cloudinary/local files, progress rows, then content docs.
 */
export const deleteContentsWithAssets = async (filter) => {
  const contents = await Content.find(filter).select(CONTENT_ASSET_FIELDS);
  const contentIds = contents.map((c) => c._id);
  const chapterIds = [...new Set(contents.map((c) => c.chapterId).filter(Boolean))];

  const assets = await destroyContentsAssets(contents);

  if (contentIds.length) {
    await Progress.deleteMany({
      $or: [
        { contentId: { $in: contentIds } },
        ...(chapterIds.length ? [{ chapterId: { $in: chapterIds } }] : []),
      ],
    });
  }

  const deleteResult = await Content.deleteMany(filter);
  return {
    deletedContents: deleteResult.deletedCount,
    destroyedCloudinary: assets.cloudinary,
    removedLocalFiles: assets.local,
    errors: assets.errors,
  };
};
