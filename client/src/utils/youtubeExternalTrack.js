import { getApiBaseUrl } from "../api/client";

export const YOUTUBE_TRACK_STORAGE_KEY = "cds_youtube_track_active";

/** API base reachable from the extension (not relative /api). */
export const getExtensionHeartbeatApiBase = () => {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://127.0.0.1:5001/api";
  if (typeof window !== "undefined") return `${window.location.origin}/api`;
  return "http://127.0.0.1:5001/api";
};

export const loadActiveYoutubeTrack = () => {
  try {
    const raw = localStorage.getItem(YOUTUBE_TRACK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const saveActiveYoutubeTrack = (session) => {
  try {
    if (session) localStorage.setItem(YOUTUBE_TRACK_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(YOUTUBE_TRACK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

export const pingYoutubeTrackerExtension = () =>
  new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener("message", onMessage);
        resolve(false);
      }
    }, 400);

    const onMessage = (event) => {
      if (event.source !== window || event.data?.type !== "CDS_YT_TRACK_PONG") return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(true);
    };

    window.addEventListener("message", onMessage);
    window.postMessage({ type: "CDS_YT_TRACK_PING" }, "*");
  });

export const startYoutubeExternalTrack = ({ contentId, videoId, subjectId, subjectName, title, youtubeUrl, token }) => {
  const session = {
    contentId,
    videoId,
    subjectId: subjectId || null,
    subjectName: subjectName || "",
    title: title || "",
    youtubeUrl,
    token,
    apiBase: getExtensionHeartbeatApiBase(),
    startedAt: Date.now(),
  };
  saveActiveYoutubeTrack(session);
  window.postMessage({ type: "CDS_YT_TRACK_START", session }, "*");
  return session;
};

export const stopYoutubeExternalTrack = () => {
  saveActiveYoutubeTrack(null);
  window.postMessage({ type: "CDS_YT_TRACK_STOP" }, "*");
};

export const openTrackedYoutubeWatch = (youtubeUrl) => {
  const url = String(youtubeUrl || "").trim();
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
};
