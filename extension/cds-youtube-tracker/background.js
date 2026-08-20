/** Sends heartbeats to the CDS API and notifies open app tabs. */
let pendingSeconds = 0;

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
        source: "youtube-external",
        videoId: session.videoId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Heartbeat failed (${response.status})`);
  }
  return response.json();
}

async function notifyAppTabs(payload) {
  const patterns = ["http://localhost:5173/*", "http://127.0.0.1:5173/*"];
  for (const pattern of patterns) {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
      }
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
      if (cdsTrackSession && pendingSeconds >= 30) {
        const mins = Math.max(1, Math.round(pendingSeconds / 60));
        postHeartbeat(cdsTrackSession, mins).catch(() => {});
      }
      pendingSeconds = 0;
    });
  }
});
