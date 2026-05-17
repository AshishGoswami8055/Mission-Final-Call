import fs from "node:fs";
import path from "node:path";
import {
  getCloudConfig,
  getCloudinaryFor,
  isKnownCloud,
  pickCloudinarySdkConfig,
} from "../config/cloudinary.js";

/** ~20 MB chunks — Cloudinary's recommended sweet-spot for upload_large. */
const CHUNK_SIZE_BYTES = 20 * 1024 * 1024;

/** 30 minutes — videos are ~300 MB at 720p and we use chunked upload. */
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

const safeSegment = (value = "") =>
  String(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const buildFolder = ({ courseFolder, batchFolder, subjectName }) => {
  const segments = [courseFolder, batchFolder, subjectName, "videos"]
    .map(safeSegment)
    .filter(Boolean);
  return segments.length ? `cds-journey/${segments.join("/")}` : "cds-journey";
};

const buildPublicIdHint = (titleHint, fallbackName) => {
  const base = safeSegment(titleHint || fallbackName || "video");
  return `${base || "video"}_${Date.now()}`;
};

/**
 * Upload a local video file to a specific Cloudinary account using a
 * chunked stream so we can emit per-byte progress events (not provided by
 * the SDK's high-level upload_large).
 *
 * @param {Object} params
 * @param {string} params.absoluteFilePath   Local temp file to upload
 * @param {string} params.cloudType          Cloud key (e.g. "cloud1")
 * @param {string} params.courseFolder       e.g. "CDS 1 2026"
 * @param {string} params.batchFolder        e.g. "Main"
 * @param {string} params.subjectName        e.g. "Physics"
 * @param {string} [params.titleHint]        Friendly hint used for the public_id
 * @param {string} [params.originalFilename] Fallback for public_id
 * @param {(p: { bytesUploaded:number, bytesTotal:number, percent:number })=>void} [params.onProgress]
 */
export const uploadVideoToCloudinary = async ({
  absoluteFilePath,
  cloudType,
  courseFolder,
  batchFolder,
  subjectName,
  titleHint,
  originalFilename,
  onProgress,
}) => {
  if (!absoluteFilePath || !fs.existsSync(absoluteFilePath)) {
    throw new Error("Local video file not found for Cloudinary upload");
  }
  if (!isKnownCloud(cloudType)) {
    throw new Error(
      `Cloud account "${cloudType}" is not configured on the server`
    );
  }

  const { cloudinary, config } = getCloudinaryFor(cloudType);
  const sdkCfg = pickCloudinarySdkConfig(config);
  const folder = buildFolder({ courseFolder, batchFolder, subjectName });
  const publicIdHint = buildPublicIdHint(
    titleHint,
    originalFilename || path.basename(absoluteFilePath)
  );

  const fileSize = fs.statSync(absoluteFilePath).size;
  const options = {
    ...sdkCfg,
    resource_type: "video",
    folder,
    public_id: publicIdHint,
    chunk_size: CHUNK_SIZE_BYTES,
    timeout: UPLOAD_TIMEOUT_MS,
    use_filename: false,
    unique_filename: true,
    overwrite: false,
  };

  return new Promise((resolve, reject) => {
    const cloudStream = cloudinary.uploader.upload_chunked_stream(
      options,
      (err, result) => {
        if (err) return reject(err);
        if (!result?.secure_url || !result?.public_id) {
          return reject(new Error("Cloudinary returned an incomplete response"));
        }
        resolve(result);
      }
    );

    const fileStream = fs.createReadStream(absoluteFilePath, {
      highWaterMark: 1024 * 1024, // 1 MB reads → fine-grained progress
    });

    let bytesUploaded = 0;
    let lastEmitTs = 0;
    let lastEmitBytes = 0;

    fileStream.on("data", (chunk) => {
      bytesUploaded += chunk.length;
      const t = Date.now();
      // Throttle to ~5 events per second; always emit on completion.
      const reachedEnd = bytesUploaded >= fileSize;
      if (typeof onProgress !== "function") return;
      if (reachedEnd || t - lastEmitTs > 200) {
        try {
          onProgress({
            bytesUploaded,
            bytesTotal: fileSize,
            percent: fileSize > 0 ? Math.min(100, (bytesUploaded / fileSize) * 100) : 0,
            instantaneousBps:
              t > lastEmitTs ? Math.max(0, ((bytesUploaded - lastEmitBytes) / ((t - lastEmitTs) / 1000))) : 0,
          });
        } catch {
          /* ignore listener errors */
        }
        lastEmitTs = t;
        lastEmitBytes = bytesUploaded;
      }
    });

    fileStream.on("error", (err) => reject(err));
    fileStream.pipe(cloudStream);
  });
};

/**
 * Destroy a Cloudinary video. Swallows errors after logging so callers can
 * proceed with DB cleanup even if the remote side is flaky.
 */
export const destroyCloudinaryVideo = async ({ cloudType, publicId }) => {
  if (!publicId || !cloudType) return { ok: false, skipped: true };
  const cfg = getCloudConfig(cloudType);
  if (!cfg) {
    console.warn(
      `[cloudinary] cannot destroy ${publicId}: cloud "${cloudType}" not configured`
    );
    return { ok: false, skipped: true };
  }
  const { cloudinary } = getCloudinaryFor(cloudType);
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      ...pickCloudinarySdkConfig(cfg),
      resource_type: "video",
      invalidate: true,
    });
    return { ok: true, result };
  } catch (error) {
    console.warn(`[cloudinary] destroy failed for ${publicId}:`, error.message);
    return { ok: false, error: error.message };
  }
};

const buildPaperFolder = (year) => {
  const y = safeSegment(String(year || "unknown"));
  return y ? `cds-journey/papers/PYQ/${y}` : "cds-journey/papers/PYQ";
};

/**
 * Upload a local PDF to Cloudinary as a raw asset (PYQ papers — default cloud1).
 */
export const uploadPdfToCloudinary = async ({
  absoluteFilePath,
  cloudType,
  year,
  titleHint,
  originalFilename,
}) => {
  if (!absoluteFilePath || !fs.existsSync(absoluteFilePath)) {
    throw new Error("Local PDF file not found for Cloudinary upload");
  }
  if (!isKnownCloud(cloudType)) {
    throw new Error(`Cloud account "${cloudType}" is not configured on the server`);
  }

  const { cloudinary, config } = getCloudinaryFor(cloudType);
  const sdkCfg = pickCloudinarySdkConfig(config);
  const folder = buildPaperFolder(year);
  const publicIdHint = buildPublicIdHint(
    titleHint,
    originalFilename || path.basename(absoluteFilePath)
  );

  const options = {
    ...sdkCfg,
    resource_type: "raw",
    folder,
    public_id: publicIdHint,
    chunk_size: CHUNK_SIZE_BYTES,
    timeout: UPLOAD_TIMEOUT_MS,
    use_filename: false,
    unique_filename: true,
    overwrite: false,
  };

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(absoluteFilePath, options, (err, result) => {
      if (err) return reject(err);
      if (!result?.secure_url || !result?.public_id) {
        return reject(new Error("Cloudinary returned an incomplete response for PDF upload"));
      }
      resolve(result);
    });
  });
};

export const destroyCloudinaryRaw = async ({ cloudType, publicId }) => {
  if (!publicId || !cloudType) return { ok: false, skipped: true };
  const cfg = getCloudConfig(cloudType);
  if (!cfg) {
    console.warn(
      `[cloudinary] cannot destroy raw ${publicId}: cloud "${cloudType}" not configured`
    );
    return { ok: false, skipped: true };
  }
  const { cloudinary } = getCloudinaryFor(cloudType);
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      ...pickCloudinarySdkConfig(cfg),
      resource_type: "raw",
      invalidate: true,
    });
    return { ok: true, result };
  } catch (error) {
    console.warn(`[cloudinary] destroy raw failed for ${publicId}:`, error.message);
    return { ok: false, error: error.message };
  }
};

export const safeUnlink = (absolutePath) => {
  if (!absolutePath) return;
  try {
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch (err) {
    console.warn(`[cloudinary] failed to remove temp file ${absolutePath}:`, err.message);
  }
};
