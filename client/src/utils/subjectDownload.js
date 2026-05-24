import api from "../api/client";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const triggerBrowserDownload = (url, fileName = "") => {
  if (!url) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

export const downloadSubjectVideosToBrowser = async (subjectId, { onProgress } = {}) => {
  const { data } = await api.get(`/subjects/${subjectId}/download-pack`);
  const items = data?.items || [];
  if (!items.length) {
    throw new Error("No downloadable videos in this subject.");
  }

  onProgress?.({ phase: "downloading", current: 0, total: items.length, title: data.subjectName });

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    onProgress?.({
      phase: "downloading",
      current: index + 1,
      total: items.length,
      title: item.title,
    });
    triggerBrowserDownload(item.downloadUrl, item.fileName);
    if (index < items.length - 1) {
      await sleep(1200);
    }
  }

  return { total: items.length, subjectName: data.subjectName };
};

export const startSubjectSmoothPlayback = async (subjectId) => {
  const { data } = await api.post(`/subjects/${subjectId}/local-library`);
  return data;
};

export const fetchSubjectSmoothPlaybackStatus = async (subjectId) => {
  const { data } = await api.get(`/subjects/${subjectId}/local-library`);
  return data;
};

export const pollSubjectSmoothPlayback = async (subjectId, { onProgress, intervalMs = 3000 } = {}) => {
  while (true) {
    const status = await fetchSubjectSmoothPlaybackStatus(subjectId);
    onProgress?.(status);
    if (status.status === "done" || status.status === "error") {
      return status;
    }
    if (status.status === "idle" && status.total === 0) {
      return status;
    }
    await sleep(intervalMs);
  }
};
