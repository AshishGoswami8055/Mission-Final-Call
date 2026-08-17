import api from "../api/client";

export const fetchLocalMediaStorage = () => api.get("/settings/local-media");

export const updateLocalMediaStorage = (payload) => api.put("/settings/local-media", payload);

export const fetchStreamCache = () => api.get("/settings/stream-cache");

export const syncStreamCache = () => api.post("/settings/stream-cache/sync");

export const fetchContentStreamCache = (contentId) =>
  api.get(`/contents/${contentId}/stream-cache`);

export const clearStreamCache = (cacheKeyOrKeys = null) => {
  if (Array.isArray(cacheKeyOrKeys)) {
    return api.delete("/settings/stream-cache", { data: { cacheKeys: cacheKeyOrKeys } });
  }
  return api.delete("/settings/stream-cache", {
    params: cacheKeyOrKeys ? { cacheKey: cacheKeyOrKeys } : undefined,
  });
};

export const revealStreamCacheItem = (cacheKey) =>
  api.post(`/settings/stream-cache/${encodeURIComponent(cacheKey)}/reveal`);

export const revealStreamCacheFolder = () => api.post("/settings/stream-cache/reveal-folder");
