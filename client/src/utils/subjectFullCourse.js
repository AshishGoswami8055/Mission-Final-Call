import api, { getStreamBackendBaseUrl } from "../api/client";

const getAuthToken = () => localStorage.getItem("cds_token") || "";

/**
 * Always stream via the API — it reads linkedSourcePath on disk (any folder).
 * Static /uploads/... URLs only serve the project uploads dir and 404 for
 * files sitting in CDS UPLOAD (e.g. Complete Indian Geography.mp4).
 */
export const getFullCourseStreamUrl = (subjectId) => {
  const backend = getStreamBackendBaseUrl();
  const token = getAuthToken();
  const tokenQs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${backend}/api/subjects/${subjectId}/merged-video/stream${tokenQs}`;
};

export const fetchFullCourseStatus = (subjectId) =>
  api.get(`/subjects/${subjectId}/merged-video`);

export const revealFullCourseVideo = (subjectId) =>
  api.post(`/subjects/${subjectId}/merged-video/reveal`);

export const replaceFullCourseVideo = (subjectId, file, { onUploadProgress } = {}) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/subjects/${subjectId}/merged-video/replace`, form, {
    headers: {
      "Content-Type": "multipart/form-data",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    timeout: 0,
    onUploadProgress: (event) => {
      if (!event.total) return;
      onUploadProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    },
  });
};

export const linkFullCourseFromPath = (subjectId, filePath, originalName) =>
  api.post(`/subjects/${subjectId}/merged-video/link-local`, { filePath, originalName });

export const pickFullCourseVideo = (subjectId) =>
  api.post(`/subjects/${subjectId}/merged-video/pick-local`, {}, { timeout: 0 });

export const toggleSubjectCompleted = (subjectId) =>
  api.post(`/progress/subject/${subjectId}/toggle-all`);
