/** Relays track start/stop from the CDS app into extension storage. */
const STORAGE_KEY = "cdsTrackSession";

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data?.type) return;

  if (event.data.type === "CDS_YT_TRACK_PING") {
    window.postMessage({ type: "CDS_YT_TRACK_PONG" }, "*");
    return;
  }

  if (event.data.type === "CDS_YT_TRACK_START" && event.data.session) {
    chrome.storage.local.set({ [STORAGE_KEY]: event.data.session });
    window.postMessage({ type: "CDS_YT_TRACK_STARTED", session: event.data.session }, "*");
    return;
  }

  if (event.data.type === "CDS_YT_TRACK_STOP") {
    chrome.storage.local.remove(STORAGE_KEY);
    chrome.runtime.sendMessage({ type: "FLUSH_AND_STOP" });
    window.postMessage({ type: "CDS_YT_TRACK_STOPPED" }, "*");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "HEARTBEAT_SENT") {
    window.postMessage(
      {
        type: "CDS_YT_TRACK_TICK",
        minutes: message.minutes,
        subjectId: message.subjectId,
        streak: message.streak,
      },
      "*"
    );
  }
  if (message?.type === "TRACK_STATUS") {
    window.postMessage({ type: "CDS_YT_TRACK_STATUS", status: message.status }, "*");
  }
});
