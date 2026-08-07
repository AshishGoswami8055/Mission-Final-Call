import api, { getApiBaseUrl, getMediaApiBaseUrl } from "../api/client";
import { createUploadId, waitForUploadProgress } from "./uploadProgress";
import { triggerBrowserDownload } from "./subjectDownload";

const getAuthToken = () => localStorage.getItem("cds_token") || "";

export const getMergedVideoStreamUrl = (subjectId) => {
  const token = getAuthToken();
  const base = `${getMediaApiBaseUrl()}/subjects/${subjectId}/merged-video/stream`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
};

const runMergeJob = async (endpoint, subjectId, { onProgress, pendingMessage }) => {
  const uploadId = createUploadId();
  onProgress?.({ phase: "pending", percent: 0, message: pendingMessage });

  const progressWait = waitForUploadProgress(uploadId, (data) => {
    onProgress?.({
      phase: data.phase || "merging",
      percent: data.percent ?? 0,
      message: data.message || pendingMessage,
      currentFile: data.currentFile,
      fileIndex: data.fileIndex,
      filesTotal: data.filesTotal,
    });
  });

  try {
    const response = await api.post(`/subjects/${subjectId}/merged-video/${endpoint}`, { uploadId });
    if (response.status === 202) {
      await progressWait;
    } else {
      progressWait.cancel();
    }
    return response.data;
  } catch (error) {
    progressWait.cancel();
    throw error;
  }
};

export const downloadSubjectMergeParts = (subjectId, options) =>
  runMergeJob("parts", subjectId, {
    ...options,
    pendingMessage: "Step 1/2 — downloading all chapters…",
  });

export const stitchSubjectMergedVideo = (subjectId, options) =>
  runMergeJob("stitch", subjectId, {
    ...options,
    pendingMessage: "Step 2/2 — stitching into one video…",
  });

/** Download all chapters, then stitch — skips work when already cached. */
export const ensureSubjectMergedVideo = async (subjectId, { onProgress } = {}) => {
  onProgress?.({ phase: "checking", percent: 0, message: "Checking full course video…" });

  const statusRes = await api.get(`/subjects/${subjectId}/merged-video`);
  if (statusRes.data?.ready) {
    onProgress?.({ phase: "done", percent: 100, message: "Full course video ready" });
    return statusRes.data;
  }

  if (!statusRes.data?.partsComplete) {
    await downloadSubjectMergeParts(subjectId, { onProgress });
  } else {
    onProgress?.({
      phase: "downloading",
      percent: 85,
      message: `All ${statusRes.data.partsTotal} chapters ready — starting stitch`,
    });
  }

  await stitchSubjectMergedVideo(subjectId, { onProgress });

  const finalStatus = await api.get(`/subjects/${subjectId}/merged-video`);
  onProgress?.({ phase: "done", percent: 100, message: "Full course video ready" });
  return finalStatus.data;
};

export const downloadSubjectMergedVideo = async (subjectId, { onProgress } = {}) => {
  await ensureSubjectMergedVideo(subjectId, { onProgress });

  const token = getAuthToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  const url = `${getApiBaseUrl()}/subjects/${subjectId}/merged-video/download${qs}`;
  triggerBrowserDownload(url, "");
  onProgress?.({ phase: "done", percent: 100, message: "Download started" });
  return { ok: true };
};
