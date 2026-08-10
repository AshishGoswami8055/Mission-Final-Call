import api from "../api/client";

export const fetchLocalMediaStorage = () => api.get("/settings/local-media");

export const updateLocalMediaStorage = (payload) => api.put("/settings/local-media", payload);

export const fetchStreamCache = () => api.get("/settings/stream-cache");

export const fetchContentStreamCache = (contentId) =>
  api.get(`/contents/${contentId}/stream-cache`);

export const clearStreamCache = (cacheKey = null) =>
  api.delete("/settings/stream-cache", {
    params: cacheKey ? { cacheKey } : undefined,
  });

export const revealStreamCacheItem = (cacheKey) =>
  api.post(`/settings/stream-cache/${encodeURIComponent(cacheKey)}/reveal`);

export const revealStreamCacheFolder = () => api.post("/settings/stream-cache/reveal-folder");
