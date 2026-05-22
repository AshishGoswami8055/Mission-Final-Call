import fs from "node:fs";
import path from "node:path";
import { TEMP_VIDEO_UPLOAD_DIR } from "../middlewares/uploadMiddleware.js";
import { setProgress } from "./uploadProgressBus.js";
import {
  autofitCompressVideo,
  compressDefaults,
  needsCompression,
  probeVideo,
} from "./videoCompressService.js";

export const CLOUDINARY_FREE_LIMIT_BYTES = 95 * 1024 * 1024;

const compressedTempPathFor = (sourceAbsolutePath) => {
  const base = path.basename(sourceAbsolutePath, path.extname(sourceAbsolutePath));
  const stamp = Date.now().toString(36);
  return path.join(TEMP_VIDEO_UPLOAD_DIR, `${base}_${stamp}_720p.mp4`);
};

/**
 * Re-encode the video to 720p H.264 + AAC + faststart when it's too large
 * for Cloudinary or in a less compatible format.
 */
export const prepareVideoForCloud = async ({ sourcePath, originalSizeBytes, uploadId }) => {
  let probe = null;
  try {
    probe = await probeVideo(sourcePath);
  } catch (err) {
    probe = null;
    console.warn(`[video-cloud] probeVideo failed: ${err.message}`);
  }

  const alwaysCompress = String(process.env.VIDEO_COMPRESS_ALWAYS || "1") !== "0";
  const sizeBytes = Number(originalSizeBytes || 0);
  const sizeOverThreshold = sizeBytes >= compressDefaults.SKIP_IF_BELOW_BYTES;
  const shouldCompress = alwaysCompress
    ? true
    : probe
      ? needsCompression(probe)
      : sizeOverThreshold;

  if (!shouldCompress) {
    return {
      pathToUpload: sourcePath,
      compressedPath: null,
      probe,
      compressed: false,
    };
  }

  const target = compressedTempPathFor(sourcePath);
  if (uploadId) {
    setProgress(uploadId, {
      phase: "compressing",
      percent: 0,
      message: `Compressing to ${compressDefaults.TARGET_HEIGHT}p (CRF ${compressDefaults.CRF})`,
      bytesLoaded: 0,
      bytesTotal: 0,
      bytesPerSecond: 0,
    });
  }

  const result = await autofitCompressVideo({
    inputPath: sourcePath,
    outputPath: target,
    maxBytes: CLOUDINARY_FREE_LIMIT_BYTES,
    onProgress: uploadId
      ? ({ percent, currentSeconds, totalSeconds, speed, label, attempt, attempts }) => {
          setProgress(uploadId, {
            phase: "compressing",
            percent,
            bytesLoaded: Math.round(currentSeconds || 0),
            bytesTotal: Math.round(totalSeconds || 0),
            bytesPerSecond: 0,
            compressSpeed: speed || null,
            message: attempts > 1
              ? `Compressing (${label}) · attempt ${attempt}/${attempts}`
              : `Compressing (${label})`,
          });
        }
      : undefined,
  });

  if (!result.fits) {
    throw new Error(
      `Compressed video is still ${(result.sizeBytes / 1024 / 1024).toFixed(1)} MB after maximum compression (${result.attemptLabel}). Cloudinary free-plan limit is 100 MB per asset. Trim the video, split it into shorter parts, or upgrade your Cloudinary plan.`
    );
  }

  return {
    pathToUpload: target,
    compressedPath: target,
    probe,
    compressed: true,
    originalSizeBytes,
    finalSizeBytes: result.sizeBytes,
    attemptLabel: result.attemptLabel,
  };
};

export const readFileSize = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  return fs.statSync(filePath).size;
};
