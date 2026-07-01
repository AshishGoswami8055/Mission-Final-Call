import { resolvePaperCloudinaryAssetRefs } from "../utils/cloudinaryAsset.js";
import { destroyCloudinaryAsset } from "./cloudinaryUploadService.js";

/**
 * Delete Cloudinary + local files for one paper document.
 */
export const destroyPaperAssets = async (paper) => {
  if (!paper) return { cloudinary: 0, local: 0, errors: [] };

  let cloudinary = 0;
  const errors = [];
  const refs = resolvePaperCloudinaryAssetRefs(paper);

  if (refs.isCloudinary && refs.publicId && refs.cloudType) {
    const result = await destroyCloudinaryAsset({
      cloudType: refs.cloudType,
      publicId: refs.publicId,
      resourceType: "raw",
    });
    if (result?.ok) cloudinary += 1;
    else if (!result?.skipped) errors.push(result?.error || "Cloudinary destroy failed");
  } else if (refs.isCloudinary) {
    errors.push("Cloudinary URL found but publicId could not be resolved");
  }

  return { cloudinary, local: 0, errors };
};
