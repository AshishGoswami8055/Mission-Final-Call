import api from "../api/client";

export const fetchYoutubePlaybackStatus = (contentId) =>
  api.get(`/contents/${contentId}/youtube-playback`, {
    params: { _: Date.now() },
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });

export const startYoutubePlaybackPrepare = (contentId) =>
  api.post(`/contents/${contentId}/youtube-playback`, null, {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
