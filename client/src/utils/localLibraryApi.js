import api from "../api/client";

/** Poll-friendly fetch — bypasses browser/Express ETag caching on progress endpoints. */
export const fetchLocalLibraryStatus = (contentId) =>
  api.get(`/contents/${contentId}/local-library`, {
    params: { _: Date.now() },
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });

export const startLocalLibraryDownload = (contentId) =>
  api.post(`/contents/${contentId}/local-library`, null, {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });

export const replaceLocalLibraryVideo = (contentId, file, { onUploadProgress } = {}) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/contents/${contentId}/local-library/replace`, form, {
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
