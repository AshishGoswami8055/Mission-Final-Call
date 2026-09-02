/** Sends heartbeats to the CDS API and notifies open CDS Journey app tabs. */

const PROGRESS_PUSH_MS = 5_000;

let syncInFlight = null;

function isAppTabUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/api/")) return false;
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const localHost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname);
    if (localHost && (port === "5173" || port === "5001" || port === "80" || port === "443")) {
      return true;
    }
    if (parsed.hostname.endsWith(".trycloudflare.com")) return true;
    return false;
  } catch {
    return false;
  }
}

function isAppTab(tab) {
  return isAppTabUrl(tab?.url) || /CDS Journey/i.test(tab?.title || "");
}

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
    const detail = await response.text().catch(() => "");
    throw new Error(`Heartbeat failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  return response.json();
}

/** Use stored playedMs only — never extrapolate (content script owns the stopwatch). */
function resolvePlayedMs(session) {
  if (!session) return 0;
  return Math.max(0, Number(session.playedMs) || 0);
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
    lastProgressAt: Number(session.lastProgressAt) || Date.now(),
  };
}

async function deliverToTab(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["bridge.js"],
      });
      await chrome.tabs.sendMessage(tabId, payload);
      return true;
    } catch {
      return false;
    }
  }
}

async function notifyAppTabs(payload) {
  const tabs = await chrome.tabs.query({});
  const jobs = tabs.filter((tab) => tab.id && isAppTab(tab)).map((tab) => deliverToTab(tab.id, payload));
  await Promise.all(jobs);
}

async function pushStoredProgressToApp() {
  const { cdsTrackSession } = await chrome.storage.local.get("cdsTrackSession");
  const payload = progressPayloadFromSession(cdsTrackSession);
  if (payload) await notifyAppTabs(payload);
}

async function syncSessionFromStorage() {
  // Only one sync at a time — prevents 1 minute becoming 2 on the server.
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const { cdsTrackSession, cdsAuth } = await chrome.storage.local.get(["cdsTrackSession", "cdsAuth"]);
    if (!cdsTrackSession?.videoId) {
      return { ok: false, reason: "no-session" };
    }

    const session = {
      ...cdsTrackSession,
      token: cdsTrackSession.token || cdsAuth?.token,
      apiBase: cdsTrackSession.apiBase || cdsAuth?.apiBase,
    };

    if (!session.token || !session.apiBase) {
      return { ok: false, reason: "no-auth" };
    }

    const playedMs = resolvePlayedMs(session);
    const synced = Math.max(0, Number(session.syncedMinutes) || 0);
    const totalMin = Math.floor(playedMs / 60_000);
    const delta = totalMin - synced;

    if (delta <= 0) {
      await pushStoredProgressToApp();
      return { ok: true, delta: 0, playedMs, totalMin };
    }

    // Claim minutes BEFORE the network call so a parallel flush cannot re-send them.
    const claimed = {
      ...session,
      playedMs,
      syncedMinutes: totalMin,
      lastSyncAt: Date.now(),
    };
    await chrome.storage.local.set({ cdsTrackSession: claimed });

    try {
      const data = await postHeartbeat(session, delta);

      await notifyAppTabs({
        type: "HEARTBEAT_SENT",
        minutes: delta,
        subjectId: session.subjectId,
        streak: data?.streak,
      });

      const total = data?.streak?.todayVideoMinutes;
      if (typeof total === "number") {
        chrome.action.setBadgeText({ text: String(total) });
        chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });
      }

      await pushStoredProgressToApp();
      return { ok: true, delta, playedMs, totalMin, streak: data?.streak };
    } catch (error) {
      // Roll back claim so minutes can retry.
      const { cdsTrackSession: latest } = await chrome.storage.local.get("cdsTrackSession");
      if (latest?.videoId === session.videoId) {
        await chrome.storage.local.set({
          cdsTrackSession: {
            ...latest,
            syncedMinutes: Math.min(Number(latest.syncedMinutes) || totalMin, synced),
          },
        });
      }
      throw error;
    }
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
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
    void notifyAppTabs({
      type: "TRACK_PROGRESS",
      playedMs: message.playedMs,
      syncedMinutes: message.syncedMinutes,
      isPlaying: message.isPlaying,
      title: message.title,
      videoId: message.videoId,
      lastProgressAt: message.lastProgressAt,
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "TRACK_STOPPED") {
    void notifyAppTabs({ type: "TRACK_STOPPED" });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "FLUSH_SYNC" || message?.type === "SEND_HEARTBEAT") {
    syncSessionFromStorage()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "FLUSH_AND_STOP") {
    syncSessionFromStorage()
      .catch(() => {})
      .finally(() => {
        chrome.storage.local.remove("cdsTrackSession");
        void notifyAppTabs({ type: "TRACK_STOPPED" });
      });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cds-sync-minute") {
    void syncSessionFromStorage().catch(() => {});
    return;
  }
  if (alarm.name === "cds-sync-five") {
    void syncSessionFromStorage()
      .catch(() => {})
      .finally(() => {
        void pushStoredProgressToApp();
      });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("cds-sync-minute", { periodInMinutes: 1 });
  chrome.alarms.create("cds-sync-five", { periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("cds-sync-minute", { periodInMinutes: 1 });
  chrome.alarms.create("cds-sync-five", { periodInMinutes: 5 });
});

setInterval(() => {
  void pushStoredProgressToApp();
}, PROGRESS_PUSH_MS);

chrome.alarms.create("cds-sync-minute", { periodInMinutes: 1 });
chrome.alarms.create("cds-sync-five", { periodInMinutes: 5 });
