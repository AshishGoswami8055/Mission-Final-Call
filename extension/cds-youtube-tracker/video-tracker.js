/** Track study time on any site with an HTML5 video player — YouTube and course platforms. */
const STORAGE_KEY = "cdsTrackSession";
const AUTH_KEY = "cdsAuth";
const POS_KEY = "cdsTrackerBtnPos";
const DRAG_THRESHOLD_PX = 5;
const UI_TICK_MS = 250;
const PROGRESS_BROADCAST_MS = 10_000;

let session = null;
let loadedSessionKey = "";
let playedMs = 0;
let syncedMinutes = 0;
let segmentStartMs = null;
let lastProgressBroadcast = 0;
let lastPageVideoId = null;
let uiWrap = null;
let uiButton = null;
let playerObserver = null;
let controlsVisible = false;
let isDragging = false;
let dragMoved = false;
let trackedVideoEl = null;
let playerShellEl = null;
let playerResizeObserver = null;
let playerHovered = false;

const PLAYER_HINT_RE =
  /player|video|media|vjs|plyr|jwplayer|embed|watch|lesson|course|stream|playback|lecture|classroom/i;

const isYouTube = () => /(^|\.)youtube\.com$/i.test(location.hostname);

function hashString(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

const findPlayer = () => {
  if (isYouTube()) {
    return (
      document.querySelector("#movie_player.html5-video-player") ||
      document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player")
    );
  }

  const video = findVideo();
  if (!video) return null;
  return findGenericPlayerContainer(video);
};

function findGenericPlayerContainer(video) {
  const knownSelectors = [
    ".video-js",
    ".plyr",
    ".vp-video",
    ".vjs-tech-parent",
    '[class*="player-container"]',
    '[class*="video-player"]',
    '[class*="video_player"]',
    '[class*="videoPlayer"]',
    '[id*="player"]',
  ];

  for (const selector of knownSelectors) {
    const match = video.closest(selector);
    if (match && match !== document.body) return ensurePlayerShell(match);
  }

  const videoRect = video.getBoundingClientRect();
  let el = video.parentElement;
  let best = el;

  while (el && el !== document.body && el !== document.documentElement) {
    const rect = el.getBoundingClientRect();
    const label = `${el.className} ${el.id} ${el.getAttribute("data-testid") || ""}`;
    const hinted = PLAYER_HINT_RE.test(label);
    const coversVideo =
      rect.width >= videoRect.width * 0.85 && rect.height >= videoRect.height * 0.85;
    const reasonableSize =
      rect.width <= Math.max(window.innerWidth, videoRect.width) * 0.98 &&
      rect.height <= Math.max(window.innerHeight, videoRect.height) * 0.98;

    if (coversVideo && reasonableSize && (hinted || el.contains(video))) {
      best = el;
      if (hinted) return ensurePlayerShell(el);
    }
    el = el.parentElement;
  }

  if (best && best !== document.body) return ensurePlayerShell(best);
  if (video.parentElement) return ensurePlayerShell(video.parentElement);
  return null;
}

function ensurePlayerShell(player) {
  if (!player || player === document.body || player === document.documentElement) return null;

  const style = getComputedStyle(player);
  if (style.position === "static") {
    player.dataset.cdsVtPositionPatched = "1";
    player.style.position = "relative";
  }
  player.dataset.cdsVtPlayer = "1";
  playerShellEl = player;
  return player;
}

function findAllVideos() {
  return [...document.querySelectorAll("video")].filter((video) => {
    if (video.readyState === 0 && !video.src && !video.currentSrc) return false;
    const rect = video.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 68;
  });
}

const findVideo = () => {
  if (isYouTube()) {
    return (
      document.querySelector("video.html5-main-video") ||
      document.querySelector("#movie_player video") ||
      document.querySelector("video")
    );
  }

  const videos = findAllVideos();
  if (!videos.length) return null;

  const playing = videos.find((video) => !video.paused && !video.ended);
  if (playing) return playing;

  return videos.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return rb.width * rb.height - ra.width * ra.height;
  })[0];
};

const getTitle = () => {
  if (isYouTube()) {
    const h1 =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("#title h1");
    const text = h1?.textContent?.trim();
    if (text) return text.slice(0, 180);
    return document.title.replace(/ - YouTube$/i, "").slice(0, 180);
  }

  const video = findVideo();
  const fromMeta =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector("h1")?.textContent?.trim() ||
    document.title;
  const label = String(fromMeta || "Study video").trim();
  const src = (video?.currentSrc || video?.src || "").split("/").pop()?.split("?")[0];
  if (src && !label.toLowerCase().includes(src.toLowerCase().slice(0, 12))) {
    return `${label} · ${src}`.slice(0, 180);
  }
  return label.slice(0, 180);
};

function pageVideoId() {
  if (isYouTube()) {
    return new URL(location.href).searchParams.get("v") || "";
  }

  const video = findVideo();
  if (!video) return "";

  const pageKey = `${location.origin}${location.pathname}${location.search}`;
  const src = (video.currentSrc || video.src || "").split("?")[0];
  if (src) return `page:${hashString(pageKey)}:src:${hashString(src)}`;
  return `page:${hashString(pageKey)}`;
}

/** Video is actually playing content — not paused, ended, or buffering. */
function isActivelyPlaying() {
  const video = findVideo();
  if (!video || video.paused || video.ended) return false;
  if (video.readyState < 3) return false;
  return true;
}

/** Total wall-clock ms watched — single source of truth (1× real time, ignores playback speed). */
function getPlayedMs() {
  let ms = playedMs;
  if (segmentStartMs !== null && isActivelyPlaying()) {
    ms += Date.now() - segmentStartMs;
  }
  return ms;
}

function formatClock(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function resetTimingState() {
  playedMs = 0;
  syncedMinutes = 0;
  segmentStartMs = null;
}

function hydrateTimingFromSession() {
  if (!session) {
    resetTimingState();
    return;
  }
  syncedMinutes = Math.max(0, Number(session.syncedMinutes) || 0);
  if (Number.isFinite(session.playedMs)) {
    playedMs = Math.max(0, session.playedMs);
  } else {
    const legacyMin = Math.max(0, Number(session.trackedMinutes) || 0);
    const legacySec = Math.max(0, Number(session.accumSeconds) || 0);
    playedMs = legacyMin * 60_000 + legacySec * 1000;
    syncedMinutes = legacyMin;
  }
  segmentStartMs = null;
}

async function loadSession(force = false) {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const next = stored[STORAGE_KEY] || null;
  const key = next ? `${next.videoId}:${next.startedAt}` : "";
  if (!force && key === loadedSessionKey) return session;

  session = next;
  loadedSessionKey = key;
  if (session) hydrateTimingFromSession();
  else resetTimingState();
  return session;
}

async function saveSessionPatch(patch) {
  if (!session) return;
  session = { ...session, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

async function persistSessionProgress() {
  if (!session) return;
  await saveSessionPatch({
    playedMs: getPlayedMs(),
    syncedMinutes,
    isPlaying: isActivelyPlaying(),
    lastProgressAt: Date.now(),
    pageUrl: location.href,
  });
}

function beginSegment() {
  if (!isTrackingThisVideo() || segmentStartMs !== null) return;
  if (!isActivelyPlaying()) return;
  segmentStartMs = Date.now();
}

function endSegment() {
  if (segmentStartMs === null) return;
  playedMs += Date.now() - segmentStartMs;
  segmentStartMs = null;
  void persistSessionProgress();
}

function reconcilePlayState() {
  if (!isTrackingThisVideo()) {
    if (segmentStartMs !== null) endSegment();
    return;
  }
  if (isActivelyPlaying()) beginSegment();
  else if (segmentStartMs !== null) endSegment();
}

async function sendMinutes(mins) {
  if (!session || mins <= 0) return;
  chrome.runtime.sendMessage({ type: "SEND_HEARTBEAT", minutes: mins, session });
}

function broadcastProgress(force = false) {
  if (!isTrackingThisVideo()) return;
  const now = Date.now();
  if (!force && now - lastProgressBroadcast < PROGRESS_BROADCAST_MS) return;
  lastProgressBroadcast = now;

  const payload = {
    playedMs: getPlayedMs(),
    syncedMinutes,
    isPlaying: isActivelyPlaying(),
    lastProgressAt: now,
    title: session?.title || "",
    videoId: session?.videoId || "",
    pageUrl: location.href,
  };

  void saveSessionPatch(payload);
  chrome.runtime.sendMessage({ type: "TRACK_PROGRESS", ...payload });
}

/** Sync complete minutes to server — never round partial seconds up. */
async function syncNewMinutes() {
  endSegment();
  const totalMin = Math.floor(getPlayedMs() / 60_000);
  const delta = totalMin - syncedMinutes;
  if (delta <= 0) {
    if (isActivelyPlaying()) beginSegment();
    return;
  }
  syncedMinutes = totalMin;
  await persistSessionProgress();
  await sendMinutes(delta);
  if (isActivelyPlaying()) beginSegment();
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

  if (isYouTube()) {
    if (player.classList.contains("ytp-autohide")) return false;
    const chrome = player.querySelector(".ytp-chrome-bottom");
    if (chrome) {
      const opacity = Number.parseFloat(getComputedStyle(chrome).opacity);
      if (opacity > 0.05) return true;
    }
    return !player.classList.contains("ytp-autohide");
  }

  return playerHovered;
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

function wirePlayerResize() {
  const player = findPlayer();
  if (!player || player.dataset.cdsResizeWired) return;
  player.dataset.cdsResizeWired = "1";

  if (playerResizeObserver) playerResizeObserver.disconnect();
  playerResizeObserver = new ResizeObserver(() => {
    if (!uiWrap || isDragging) return;
    void applySavedPosition();
  });
  playerResizeObserver.observe(player);
}

function wirePlayerVisibility() {
  const player = findPlayer();
  if (!player || player.dataset.cdsVisibilityWired) return;
  player.dataset.cdsVisibilityWired = "1";

  const refresh = () => updateControlsVisibility();
  player.addEventListener("mouseenter", () => {
    playerHovered = true;
    refresh();
  });
  player.addEventListener("mousemove", () => {
    playerHovered = true;
    refresh();
  });
  player.addEventListener("mouseleave", () => {
    if (!isDragging) {
      window.setTimeout(() => {
        playerHovered = false;
        refresh();
      }, 120);
    }
  });

  if (isYouTube()) {
    if (playerObserver) playerObserver.disconnect();
    playerObserver = new MutationObserver(refresh);
    playerObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
  }

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
  const playing = isActivelyPlaying() && isTrackingThisVideo();
  if (isTrackingThisVideo()) {
    uiButton.classList.add("is-tracking");
    uiButton.classList.toggle("is-playing", playing);
    uiButton.classList.toggle("is-paused", !playing);
    const status = playing ? "Tracking" : "Paused";
    uiButton.innerHTML = `<span class="dot"></span><span class="time">${formatClock(getPlayedMs())}</span><span class="status">${status}</span>`;
    uiButton.title = playing
      ? "Real-time study clock · drag to move · click to stop"
      : "Paused — clock stopped · click to stop";
  } else {
    uiButton.classList.remove("is-tracking", "is-playing", "is-paused");
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

  resetTimingState();
  session = {
    videoId,
    title: getTitle(),
    token: auth.token,
    apiBase: auth.apiBase,
    startedAt: Date.now(),
    playedMs: 0,
    syncedMinutes: 0,
    pageUrl: location.href,
    sourceHost: location.hostname,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
  reconcilePlayState();
  renderUi();
  broadcastProgress(true);
}

async function stopTracking() {
  endSegment();
  await syncNewMinutes();
  await chrome.storage.local.remove(STORAGE_KEY);
  session = null;
  loadedSessionKey = "";
  resetTimingState();
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
  if (playerResizeObserver) {
    playerResizeObserver.disconnect();
    playerResizeObserver = null;
  }
  uiWrap?.remove();
  uiWrap = null;
  uiButton = null;
  playerHovered = false;

  const player = playerShellEl || findPlayer();
  if (player) {
    delete player.dataset.cdsVisibilityWired;
    delete player.dataset.cdsResizeWired;
  }
  playerShellEl = null;

  if (trackedVideoEl) {
    delete trackedVideoEl.dataset.cdsTrackerWired;
    trackedVideoEl = null;
  }
}

function injectUi() {
  if (uiWrap) return;

  const video = findVideo();
  if (!video) return;

  const videoId = pageVideoId();
  if (!videoId) return;

  const player = findPlayer();
  if (!player) return;

  if (!document.querySelector('link[href*="video-tracker-ui.css"], link[href*="youtube-ui.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("video-tracker-ui.css");
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
  wirePlayerResize();
  void loadSession().then(async () => {
    reconcilePlayState();
    renderUi();
    await applySavedPosition();
    updateControlsVisibility();
  });
}

function ensureUi() {
  const video = findVideo();
  if (!video) {
    removeUi();
    return;
  }

  if (isYouTube() && !new URL(location.href).searchParams.get("v")) {
    removeUi();
    return;
  }

  if (!pageVideoId()) return;

  const player = findPlayer();
  if (!player) return;

  if (!uiWrap) injectUi();
  else if (uiWrap.parentElement !== player) {
    player.appendChild(uiWrap);
    wirePlayerVisibility();
    wirePlayerResize();
    void applySavedPosition();
  } else {
    wirePlayerVisibility();
  }
  updateControlsVisibility();
}

function onVideoStateChange() {
  reconcilePlayState();
  renderUi();
  broadcastProgress(true);
  if (isTrackingThisVideo() && !isActivelyPlaying()) {
    void syncNewMinutes();
  }
}

function attachVideoListeners() {
  const video = findVideo();
  if (!video) return;

  if (trackedVideoEl && trackedVideoEl !== video) {
    delete trackedVideoEl.dataset.cdsTrackerWired;
  }

  if (video.dataset.cdsTrackerWired && trackedVideoEl === video) return;
  video.dataset.cdsTrackerWired = "1";
  trackedVideoEl = video;

  const events = ["play", "playing", "pause", "ended", "waiting", "seeking", "seeked", "ratechange"];
  for (const name of events) {
    video.addEventListener(name, onVideoStateChange);
  }

  if (!isYouTube()) {
    video.addEventListener("loadedmetadata", () => {
      ensureUi();
      onVideoStateChange();
    });
  }
}

async function tick() {
  ensureUi();
  attachVideoListeners();
  reconcilePlayState();
  renderUi();

  if (!session || !isTrackingThisVideo()) return;

  const vid = pageVideoId();
  if (!vid || vid !== session.videoId) {
    if (lastPageVideoId !== vid) endSegment();
    lastPageVideoId = vid;
    return;
  }
  lastPageVideoId = vid;

  const totalMin = Math.floor(getPlayedMs() / 60_000);
  if (totalMin > syncedMinutes) {
    await syncNewMinutes();
  }

  broadcastProgress(false);
}

function onPageContextChange() {
  endSegment();
  lastPageVideoId = pageVideoId();
  removeUi();
  ensureUi();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  const next = changes[STORAGE_KEY].newValue;
  if (!next && session) {
    endSegment();
    void syncNewMinutes();
  }
  session = next || null;
  loadedSessionKey = session ? `${session.videoId}:${session.startedAt}` : "";
  if (!session) resetTimingState();
  else hydrateTimingFromSession();
  renderUi();
});

if (isYouTube()) {
  window.addEventListener("yt-navigate-finish", onPageContextChange);
}

window.addEventListener("popstate", onPageContextChange);
window.addEventListener("hashchange", onPageContextChange);

if (!window.__cdsVtHistoryPatched) {
  window.__cdsVtHistoryPatched = true;
  const wrapHistory = (method) => {
    const original = history[method];
    history[method] = function historyPatched(...args) {
      const result = original.apply(this, args);
      onPageContextChange();
      return result;
    };
  };
  wrapHistory("pushState");
  wrapHistory("replaceState");
}

window.addEventListener("resize", () => {
  void applySavedPosition();
});

window.addEventListener("beforeunload", () => {
  if (!session) return;
  endSegment();
  const delta = Math.floor(getPlayedMs() / 60_000) - syncedMinutes;
  if (delta > 0) {
    chrome.runtime.sendMessage({ type: "SEND_HEARTBEAT", minutes: delta, session });
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    endSegment();
    void syncNewMinutes();
  } else {
    reconcilePlayState();
    renderUi();
  }
});

ensureUi();
setInterval(() => {
  void tick();
}, UI_TICK_MS);
