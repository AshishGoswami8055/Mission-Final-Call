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
