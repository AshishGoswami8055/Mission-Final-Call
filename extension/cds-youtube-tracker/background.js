/** Sends heartbeats to the CDS API and notifies open app tabs. */

const APP_TAB_URLS = ["http://localhost:5173/*", "http://127.0.0.1:5173/*"];
const PROGRESS_PUSH_MS = 10_000;

async function postHeartbeat(session, minutes) {
  if (!session?.token || !session?.apiBase || minutes <= 0) return null;

  const response = await fetch(`${session.apiBase}/mission/session/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({
      contentId: session.contentId || null,
      durationMinutes: minutes,
      subjectId: session.subjectId || null,
      subjectName: session.subjectName || "",
      meta: {
        title: session.title || "",
        source: session.sourceHost ? `external-video:${session.sourceHost}` : "external-video",
        videoId: session.videoId,
        pageUrl: session.pageUrl || "",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Heartbeat failed (${response.status})`);
  }
  return response.json();
}

function resolvePlayedMs(session) {
  if (!session) return 0;
  let playedMs = Math.max(0, Number(session.playedMs) || 0);
  if (session.isPlaying && session.lastProgressAt) {
    playedMs += Math.max(0, Date.now() - Number(session.lastProgressAt));
  }
  return playedMs;
}

function progressPayloadFromSession(session) {
  if (!session?.videoId) return null;
  return {
    type: "TRACK_PROGRESS",
    playedMs: resolvePlayedMs(session),
    syncedMinutes: Math.max(0, Number(session.syncedMinutes) || 0),
    isPlaying: Boolean(session.isPlaying),
    title: session.title || "",
    videoId: session.videoId || "",
  };
}

async function notifyAppTabs(payload) {
  const tabs = await chrome.tabs.query({ url: APP_TAB_URLS });
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    }
  }
}

async function pushStoredProgressToApp() {
  const { cdsTrackSession } = await chrome.storage.local.get("cdsTrackSession");
  const payload = progressPayloadFromSession(cdsTrackSession);
  if (payload) await notifyAppTabs(payload);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_TRACK_STATE") {
    chrome.storage.local.get("cdsTrackSession").then(({ cdsTrackSession }) => {
      const payload = progressPayloadFromSession(cdsTrackSession);
      sendResponse({ ok: true, progress: payload });
    });
    return true;
  }

  if (message?.type === "TRACK_PROGRESS") {
    notifyAppTabs({
      type: "TRACK_PROGRESS",
      playedMs: message.playedMs,
      syncedMinutes: message.syncedMinutes,
      isPlaying: message.isPlaying,
      title: message.title,
      videoId: message.videoId,
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "SEND_HEARTBEAT") {
    postHeartbeat(message.session, message.minutes)
      .then((data) => {
        notifyAppTabs({
          type: "HEARTBEAT_SENT",
          minutes: message.minutes,
          subjectId: message.session?.subjectId,
          streak: data?.streak,
        });
        const total = data?.streak?.todayVideoMinutes;
        if (typeof total === "number") {
          chrome.action.setBadgeText({ text: String(total) });
          chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });
        }
        sendResponse({ ok: true, streak: data?.streak });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "FLUSH_AND_STOP") {
    chrome.storage.local.get("cdsTrackSession").then(({ cdsTrackSession }) => {
      if (!cdsTrackSession) return;
      const played = resolvePlayedMs(cdsTrackSession);
      const synced = Number(cdsTrackSession.syncedMinutes) || 0;
      const delta = Math.floor(played / 60_000) - synced;
      if (delta > 0) postHeartbeat(cdsTrackSession, delta).catch(() => {});
    });
  }
});

setInterval(() => {
  void pushStoredProgressToApp();
}, PROGRESS_PUSH_MS);
