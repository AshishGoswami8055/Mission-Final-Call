/** Track study time directly on youtube.com — no CDS app tab needed. */
const STORAGE_KEY = "cdsTrackSession";
const AUTH_KEY = "cdsAuth";
const POS_KEY = "cdsTrackerBtnPos";
const SYNC_EVERY_SEC = 30;
const FLUSH_MIN_SEC = 15;
const DRAG_THRESHOLD_PX = 5;

let session = null;
let lastVideoTime = 0;
let accumSeconds = 0;
let lastPageVideoId = null;
let uiWrap = null;
let uiButton = null;
let trackedMinutes = 0;
let lastSyncAt = 0;
let playerObserver = null;
let controlsVisible = false;
let isDragging = false;
let dragMoved = false;

const pageVideoId = () => new URL(location.href).searchParams.get("v") || "";

const findPlayer = () =>
  document.querySelector("#movie_player.html5-video-player") ||
  document.querySelector("#movie_player") ||
  document.querySelector(".html5-video-player");

const findVideo = () =>
  document.querySelector("video.html5-main-video") ||
  document.querySelector("#movie_player video") ||
  document.querySelector("video");

const getTitle = () => {
  const h1 =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
    document.querySelector("#title h1");
  const text = h1?.textContent?.trim();
  if (text) return text.slice(0, 180);
  return document.title.replace(/ - YouTube$/i, "").slice(0, 180);
};

function resetForNewVideo() {
  lastVideoTime = 0;
  accumSeconds = 0;
  lastSyncAt = 0;
}

async function loadSession() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  session = stored[STORAGE_KEY] || null;
  if (session?.trackedMinutes) trackedMinutes = session.trackedMinutes;
  return session;
}

async function saveSessionPatch(patch) {
  if (!session) return;
  session = { ...session, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

async function sendMinutes(mins) {
  if (!session || mins <= 0) return;
  trackedMinutes += mins;
  await saveSessionPatch({ trackedMinutes });
  chrome.runtime.sendMessage({ type: "SEND_HEARTBEAT", minutes: mins, session });
}

async function flushAccum(force = false) {
  if (!session || accumSeconds < FLUSH_MIN_SEC) return;
  if (!force && accumSeconds < SYNC_EVERY_SEC && accumSeconds < 60) return;

  const mins = accumSeconds >= 60 ? Math.floor(accumSeconds / 60) : 1;
  accumSeconds = accumSeconds >= 60 ? accumSeconds % 60 : 0;
  lastSyncAt = Date.now();
  await sendMinutes(mins);
  renderUi();
}

function isTrackingThisVideo() {
  const vid = pageVideoId();
  return Boolean(session && vid && session.videoId === vid);
}

function readPlayerControlsVisible() {
  const player = findPlayer();
  if (!player) return false;
  const video = findVideo();
  if (video?.paused || video?.ended) return true;
  if (player.classList.contains("ytp-autohide")) return false;
  const chrome = player.querySelector(".ytp-chrome-bottom");
  if (chrome) {
    const opacity = Number.parseFloat(getComputedStyle(chrome).opacity);
    if (opacity > 0.05) return true;
  }
  return !player.classList.contains("ytp-autohide");
}

function updateControlsVisibility() {
  controlsVisible = readPlayerControlsVisible();
  if (!uiWrap) return;
  const show = controlsVisible || isDragging;
  uiWrap.classList.toggle("cds-yt-visible", show);
}

function clampPosition(left, top) {
  const player = findPlayer();
  if (!player || !uiWrap) return { left, top };
  const pw = player.clientWidth;
  const ph = player.clientHeight;
  const bw = uiWrap.offsetWidth || 120;
  const bh = uiWrap.offsetHeight || 32;
  const maxLeft = Math.max(0, pw - bw);
  const maxTop = Math.max(0, ph - bh);
  return {
    left: Math.min(maxLeft, Math.max(0, left)),
    top: Math.min(maxTop, Math.max(0, top)),
  };
}

function setWrapPosition(left, top, persist = false) {
  if (!uiWrap) return;
  const next = clampPosition(left, top);
  uiWrap.style.left = `${next.left}px`;
  uiWrap.style.top = `${next.top}px`;
  if (persist && findPlayer()) {
    const player = findPlayer();
    const pw = player.clientWidth || 1;
    const ph = player.clientHeight || 1;
    void chrome.storage.local.set({
      [POS_KEY]: {
        leftPct: next.left / pw,
        topPct: next.top / ph,
      },
    });
  }
}

async function applySavedPosition() {
  const player = findPlayer();
  if (!player || !uiWrap) return;
  const stored = await chrome.storage.local.get(POS_KEY);
  const pos = stored[POS_KEY];
  const pw = player.clientWidth || 1;
  const ph = player.clientHeight || 1;
  if (pos && Number.isFinite(pos.leftPct) && Number.isFinite(pos.topPct)) {
    setWrapPosition(pos.leftPct * pw, pos.topPct * ph, false);
    return;
  }
  const bw = uiWrap.offsetWidth || 140;
  setWrapPosition(pw - bw - 12, ph - 52, false);
}

function wirePlayerVisibility() {
  const player = findPlayer();
  if (!player || player.dataset.cdsVisibilityWired) return;
  player.dataset.cdsVisibilityWired = "1";

  const refresh = () => updateControlsVisibility();
  player.addEventListener("mouseenter", refresh);
  player.addEventListener("mousemove", refresh);
  player.addEventListener("mouseleave", () => {
    if (!isDragging) window.setTimeout(refresh, 120);
  });

  if (playerObserver) playerObserver.disconnect();
  playerObserver = new MutationObserver(refresh);
  playerObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
  refresh();
}

function wireDrag() {
  if (!uiWrap || !uiButton || uiButton.dataset.cdsDragWired) return;
  uiButton.dataset.cdsDragWired = "1";

  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  const onMove = (event) => {
    if (!isDragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      dragMoved = true;
    }
    setWrapPosition(originLeft + dx, originTop + dy, false);
    event.preventDefault();
  };

  const onUp = () => {
    if (!isDragging) return;
    isDragging = false;
    uiWrap.classList.remove("cds-yt-dragging");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    setWrapPosition(parseFloat(uiWrap.style.left) || 0, parseFloat(uiWrap.style.top) || 0, true);
    updateControlsVisibility();
  };

  uiButton.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    isDragging = true;
    dragMoved = false;
    startX = event.clientX;
    startY = event.clientY;
    originLeft = parseFloat(uiWrap.style.left) || 0;
    originTop = parseFloat(uiWrap.style.top) || 0;
    uiWrap.classList.add("cds-yt-dragging", "cds-yt-visible");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    event.preventDefault();
  });

  uiButton.addEventListener(
    "click",
    (event) => {
      if (dragMoved) {
        event.preventDefault();
        event.stopImmediatePropagation();
        dragMoved = false;
      }
    },
    true
  );
}

function renderUi() {
  if (!uiButton) return;
  if (isTrackingThisVideo()) {
    uiButton.classList.add("is-tracking");
    uiButton.innerHTML = `<span class="dot"></span><span class="label">${trackedMinutes}m · Stop</span>`;
    uiButton.title = "Drag to move · click to stop tracking";
  } else {
    uiButton.classList.remove("is-tracking");
    uiButton.innerHTML = '<span class="label">Track study time</span>';
    uiButton.title = "Drag to move · click to start tracking";
  }
  updateControlsVisibility();
}

async function startTrackingHere() {
  const { [AUTH_KEY]: auth } = await chrome.storage.local.get(AUTH_KEY);
  if (!auth?.token) {
    alert("Click the CDS Journey extension icon (top-right) and log in first.");
    return;
  }

  const videoId = pageVideoId();
  if (!videoId) return;

  trackedMinutes = 0;
  session = {
    videoId,
    title: getTitle(),
    token: auth.token,
    apiBase: auth.apiBase,
    startedAt: Date.now(),
    trackedMinutes: 0,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
  resetForNewVideo();
  renderUi();
}

async function stopTracking() {
  await flushAccum(true);
  await chrome.storage.local.remove(STORAGE_KEY);
  session = null;
  trackedMinutes = 0;
  resetForNewVideo();
  renderUi();
}

async function onUiClick() {
  if (isTrackingThisVideo()) await stopTracking();
  else await startTrackingHere();
}

function removeUi() {
  if (playerObserver) {
    playerObserver.disconnect();
    playerObserver = null;
  }
  uiWrap?.remove();
  uiWrap = null;
  uiButton = null;
  const player = findPlayer();
  if (player) delete player.dataset.cdsVisibilityWired;
}

function injectUi() {
  if (uiWrap || !pageVideoId()) return;
  const player = findPlayer();
  if (!player) return;

  if (!document.querySelector('link[href*="youtube-ui.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("youtube-ui.css");
    document.head.appendChild(link);
  }

  uiWrap = document.createElement("div");
  uiWrap.id = "cds-yt-tracker-wrap";

  uiButton = document.createElement("button");
  uiButton.id = "cds-yt-tracker-btn";
  uiButton.type = "button";
  uiButton.addEventListener("click", () => void onUiClick());

  uiWrap.appendChild(uiButton);
  player.appendChild(uiWrap);

  wireDrag();
  wirePlayerVisibility();
  void loadSession().then(async () => {
    renderUi();
    await applySavedPosition();
    updateControlsVisibility();
  });
}

function ensureUi() {
  if (!pageVideoId()) {
    removeUi();
    return;
  }
  if (!findPlayer()) return;
  if (!uiWrap) injectUi();
  else wirePlayerVisibility();
  updateControlsVisibility();
}

async function tick() {
  await loadSession();
  ensureUi();
  renderUi();
  if (!session) return;

  const vid = pageVideoId();
  if (!vid || vid !== session.videoId) {
    if (lastPageVideoId !== vid) resetForNewVideo();
    lastPageVideoId = vid;
    return;
  }

  if (lastPageVideoId !== vid) resetForNewVideo();
  lastPageVideoId = vid;

  const video = findVideo();
  if (!video || video.paused || video.ended) return;

  const t = Number(video.currentTime);
  if (!Number.isFinite(t)) return;

  if (lastVideoTime > 0 && t + 1 < lastVideoTime) {
    lastVideoTime = t;
    return;
  }

  const delta = lastVideoTime > 0 ? Math.max(0, Math.min(2, t - lastVideoTime)) : 0;
  lastVideoTime = t;
  if (delta <= 0) return;

  accumSeconds += delta;

  if (accumSeconds >= 60) {
    const mins = Math.floor(accumSeconds / 60);
    accumSeconds %= 60;
    await sendMinutes(mins);
    renderUi();
    return;
  }

  if (accumSeconds >= SYNC_EVERY_SEC && Date.now() - lastSyncAt >= SYNC_EVERY_SEC * 1000) {
    await flushAccum(false);
  }
}

function attachVideoListeners() {
  const video = findVideo();
  if (!video || video.dataset.cdsTrackerWired) return;
  video.dataset.cdsTrackerWired = "1";
  video.addEventListener("pause", () => {
    updateControlsVisibility();
    void flushAccum(true);
  });
  video.addEventListener("play", updateControlsVisibility);
  video.addEventListener("ended", () => void flushAccum(true));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  const next = changes[STORAGE_KEY].newValue;
  if (!next && session) void flushAccum(true);
  session = next || null;
  if (!session) trackedMinutes = 0;
  resetForNewVideo();
  renderUi();
});

window.addEventListener("yt-navigate-finish", () => {
  resetForNewVideo();
  lastPageVideoId = pageVideoId();
  removeUi();
  ensureUi();
});

window.addEventListener("resize", () => {
  void applySavedPosition();
});

window.addEventListener("beforeunload", () => {
  if (session && accumSeconds >= FLUSH_MIN_SEC) {
    const mins = accumSeconds >= 60 ? Math.floor(accumSeconds / 60) : 1;
    chrome.runtime.sendMessage({ type: "SEND_HEARTBEAT", minutes: mins, session });
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void flushAccum(true);
});

ensureUi();
setInterval(() => {
  attachVideoListeners();
  ensureUi();
  updateControlsVisibility();
  void tick();
}, 1000);
