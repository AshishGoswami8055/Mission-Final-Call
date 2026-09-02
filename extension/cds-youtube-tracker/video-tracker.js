/**
 * CDS Journey study timer — wall-clock stopwatch on any video page.
 * Counts real elapsed time only (ignores playback speed).
 * Works with YouTube, HTML5, blob/DRM players, and pages with no <video>.
 */
const STORAGE_KEY = "cdsTrackSession";
const AUTH_KEY = "cdsAuth";
const POS_KEY = "cdsTrackerBtnPos";
const DRAG_THRESHOLD_PX = 6;
const UI_TICK_MS = 250;
const PROGRESS_MS = 5_000;
const SYNC_MS = 60_000;

let session = null;
let playedMs = 0;
let syncedMinutes = 0;
let segmentStart = null;
let lastBroadcastAt = 0;
let lastSyncAt = 0;
let writingStorage = false;
let toggleBusy = false;

let uiWrap = null;
let uiButton = null;
let timeEl = null;
let statusEl = null;
let useFloatingUi = false;
let playerShell = null;
let playerHovered = false;
let isDragging = false;
let dragMoved = false;
let lastRenderedClock = "";
let lastRenderedStatus = "";
let lastRenderedTracking = null;
let playerObserver = null;
let resizeObserver = null;
let wiredVideos = new WeakSet();

/** Unique per frame — only the owning frame may count/sync (prevents 2× with all_frames). */
const FRAME_ID = `f_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
const IS_TOP_FRAME = window === window.top;

const isYouTube = () => /(^|\.)youtube\.com$/i.test(location.hostname);

function hashString(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function pageContextKey() {
  return `${location.origin}${location.pathname}${location.search}`;
}

function findAllVideos() {
  return [...document.querySelectorAll("video")].filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width >= 40 && rect.height >= 24;
  });
}

function findVideo() {
  if (isYouTube()) {
    return (
      document.querySelector("video.html5-main-video") ||
      document.querySelector("#movie_player video") ||
      document.querySelector("video")
    );
  }
  const videos = findAllVideos();
  if (!videos.length) return null;
  const playing = videos.find((v) => !v.paused && !v.ended);
  if (playing) return playing;
  return videos.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return rb.width * rb.height - ra.width * ra.height;
  })[0];
}

/** YouTube player only — never mutate host CSS on other sites (breaks DRM layouts). */
function findYouTubePlayer() {
  return (
    document.querySelector("#movie_player.html5-video-player") ||
    document.querySelector("#movie_player") ||
    document.querySelector(".html5-video-player")
  );
}

function pageVideoId() {
  if (isYouTube()) return new URL(location.href).searchParams.get("v") || "";
  return `page:${hashString(pageContextKey())}`;
}

function getTitle() {
  if (isYouTube()) {
    const h1 =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("#title h1");
    const text = h1?.textContent?.trim();
    if (text) return text.slice(0, 180);
    return document.title.replace(/ - YouTube$/i, "").slice(0, 180);
  }
  const fromMeta =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector("h1")?.textContent?.trim() ||
    document.title;
  return String(fromMeta || "Study video").trim().slice(0, 180);
}

/** Detect if media element looks paused (HTML5 / detectable DRM wrappers). */
function mediaLooksPaused(video) {
  if (!video) return null;
  try {
    if (video.ended) return true;
    if (typeof video.paused === "boolean") return video.paused;
  } catch {
    /* opaque DRM */
  }
  return null;
}

/**
 * Should the stopwatch be running?
 * - Only the session owner frame counts (avoids double time)
 * - Pause when tab hidden
 * - Pause when HTML5/YouTube video is paused
 * - For DRM/no-video: run while tracking (user stops via pill click)
 * Never uses playbackRate / currentTime — pure wall clock.
 */
function isSessionOwner() {
  return Boolean(session?.ownerId && session.ownerId === FRAME_ID);
}

function isStopwatchRunning() {
  if (!isTrackingHere() || !isSessionOwner()) return false;
  if (document.visibilityState === "hidden") return false;

  const video = findVideo();
  const paused = mediaLooksPaused(video);
  if (paused === true) return false;
  if (paused === false) return true;

  // No readable video (true DRM / iframe / canvas) — run until user stops.
  return true;
}

function getPlayedMs() {
  let ms = playedMs;
  if (segmentStart !== null && isStopwatchRunning()) {
    ms += Date.now() - segmentStart;
  }
  return Math.max(0, ms);
}

function formatClock(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function resetTiming() {
  playedMs = 0;
  syncedMinutes = 0;
  segmentStart = null;
}

function beginSegment() {
  if (!isTrackingHere() || !isSessionOwner() || segmentStart !== null) return;
  if (!isStopwatchRunning()) return;
  segmentStart = Date.now();
}

function endSegment() {
  if (segmentStart === null) return;
  playedMs += Date.now() - segmentStart;
  segmentStart = null;
}

function reconcile() {
  if (!isTrackingHere()) {
    if (segmentStart !== null) endSegment();
    return;
  }
  if (isStopwatchRunning()) beginSegment();
  else if (segmentStart !== null) endSegment();
}

function isTrackingHere() {
  if (!session?.videoId) return false;
  if (isYouTube()) {
    const vid = pageVideoId();
    return Boolean(vid && session.videoId === vid);
  }
  try {
    if (session.trackPageKey) {
      const sessionPath = new URL(session.trackPageKey, location.origin);
      if (`${sessionPath.origin}${sessionPath.pathname}` === `${location.origin}${location.pathname}`) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return session.videoId === pageVideoId();
}

async function writeSession(next) {
  writingStorage = true;
  try {
    if (next) await chrome.storage.local.set({ [STORAGE_KEY]: next });
    else await chrome.storage.local.remove(STORAGE_KEY);
  } finally {
    // Defer flag clear so onChanged from this write is ignored.
    queueMicrotask(() => {
      writingStorage = false;
    });
  }
}

async function persistProgress() {
  if (!session || !isTrackingHere() || !isSessionOwner()) return;
  const ms = getPlayedMs();
  playedMs = ms;
  if (segmentStart !== null && isStopwatchRunning()) segmentStart = Date.now();
  session = {
    ...session,
    playedMs: ms,
    syncedMinutes,
    isPlaying: isStopwatchRunning(),
    lastProgressAt: Date.now(),
    pageUrl: location.href,
  };
  await writeSession(session);
}

function broadcastProgress(force = false) {
  if (!isTrackingHere() || !isSessionOwner()) return;
  const now = Date.now();
  if (!force && now - lastBroadcastAt < PROGRESS_MS) return;
  lastBroadcastAt = now;
  const ms = getPlayedMs();
  const payload = {
    playedMs: ms,
    syncedMinutes,
    isPlaying: isStopwatchRunning(),
    lastProgressAt: now,
    title: session?.title || "",
    videoId: session?.videoId || "",
    pageUrl: location.href,
  };
  session = { ...session, ...payload };
  void writeSession(session);
  try {
    chrome.runtime.sendMessage({ type: "TRACK_PROGRESS", ...payload });
  } catch {
    /* extension reloading */
  }
}

async function flushSync() {
  endSegment();
  await persistProgress();
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "FLUSH_SYNC" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        if (response?.ok) {
          if (typeof response.totalMin === "number") {
            syncedMinutes = Math.max(syncedMinutes, response.totalMin);
          }
          if (typeof response.playedMs === "number") {
            playedMs = Math.max(playedMs, response.playedMs);
          }
          if (session) {
            session.syncedMinutes = syncedMinutes;
            session.playedMs = playedMs;
          }
        }
        resolve(response?.ok === true);
      });
    } catch {
      resolve(false);
    }
  }).finally(() => {
    reconcile();
  });
}

function renderUi() {
  if (!uiButton || !timeEl || !statusEl) return;
  const tracking = isTrackingHere();
  const running = tracking && isStopwatchRunning();
  const clock = tracking ? formatClock(getPlayedMs()) : "";
  const status = tracking ? (running ? "Tracking" : "Paused") : "";

  if (lastRenderedTracking !== tracking) {
    lastRenderedTracking = tracking;
    uiButton.classList.toggle("is-tracking", tracking);
  }

  uiButton.classList.toggle("is-playing", running);
  uiButton.classList.toggle("is-paused", tracking && !running);

  if (tracking && clock !== lastRenderedClock) {
    lastRenderedClock = clock;
    timeEl.textContent = clock;
  }
  if (tracking && status !== lastRenderedStatus) {
    lastRenderedStatus = status;
    statusEl.textContent = status;
  }

  uiButton.title = tracking
    ? running
      ? "Stopwatch running · click to stop · drag to move"
      : "Paused · click to stop · drag to move"
    : "Click to start tracking · drag to move";

  updateVisibility();
}

function updateVisibility() {
  if (!uiWrap) return;
  const show = isTrackingHere() || isDragging || playerHovered || controlsVisible();
  uiWrap.classList.toggle("cds-yt-visible", show);
}

function controlsVisible() {
  if (useFloatingUi) return true;
  const player = findYouTubePlayer();
  if (!player) return true;
  if (player.classList.contains("ytp-autohide")) return false;
  return true;
}

function clampPosition(left, top) {
  if (!uiWrap) return { left, top };
  const bw = uiWrap.offsetWidth || 140;
  const bh = uiWrap.offsetHeight || 32;
  if (useFloatingUi) {
    return {
      left: Math.min(window.innerWidth - bw - 8, Math.max(8, left)),
      top: Math.min(window.innerHeight - bh - 8, Math.max(8, top)),
    };
  }
  const player = findYouTubePlayer();
  if (!player) {
    return {
      left: Math.min(window.innerWidth - bw - 8, Math.max(8, left)),
      top: Math.min(window.innerHeight - bh - 8, Math.max(8, top)),
    };
  }
  const pw = player.clientWidth;
  const ph = player.clientHeight;
  return {
    left: Math.min(Math.max(0, pw - bw), Math.max(0, left)),
    top: Math.min(Math.max(0, ph - bh), Math.max(0, top)),
  };
}

function setWrapPosition(left, top, persist = false) {
  if (!uiWrap) return;
  const next = clampPosition(left, top);
  uiWrap.style.left = `${next.left}px`;
  uiWrap.style.top = `${next.top}px`;
  if (persist && !useFloatingUi) {
    const player = findYouTubePlayer();
    if (!player) return;
    void chrome.storage.local.set({
      [POS_KEY]: {
        leftPct: next.left / (player.clientWidth || 1),
        topPct: next.top / (player.clientHeight || 1),
      },
    });
  }
}

async function applySavedPosition() {
  if (!uiWrap) return;
  if (useFloatingUi) {
    const bw = uiWrap.offsetWidth || 140;
    const bh = uiWrap.offsetHeight || 32;
    setWrapPosition(window.innerWidth - bw - 16, window.innerHeight - bh - 16, false);
    return;
  }
  const player = findYouTubePlayer();
  if (!player) return;
  const stored = await chrome.storage.local.get(POS_KEY);
  const pos = stored[POS_KEY];
  const pw = player.clientWidth || 1;
  const ph = player.clientHeight || 1;
  if (pos && Number.isFinite(pos.leftPct) && Number.isFinite(pos.topPct)) {
    setWrapPosition(pos.leftPct * pw, pos.topPct * ph, false);
    return;
  }
  setWrapPosition(pw - (uiWrap.offsetWidth || 140) - 12, ph - 52, false);
}

async function startTracking() {
  const { [AUTH_KEY]: auth } = await chrome.storage.local.get(AUTH_KEY);
  if (!auth?.token) {
    alert("Open the CDS Journey extension icon and log in first.");
    return;
  }
  const videoId = pageVideoId();
  if (!videoId) return;

  resetTiming();
  session = {
    videoId,
    title: getTitle(),
    token: auth.token,
    apiBase: auth.apiBase,
    startedAt: Date.now(),
    playedMs: 0,
    syncedMinutes: 0,
    pageUrl: location.href,
    trackPageKey: pageContextKey(),
    sourceHost: location.hostname,
    ownerId: FRAME_ID,
    isPlaying: false,
    lastProgressAt: Date.now(),
  };
  lastRenderedTracking = null;
  lastRenderedClock = "";
  lastRenderedStatus = "";
  writingStorage = true;
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
  queueMicrotask(() => {
    writingStorage = false;
  });
  reconcile();
  renderUi();
  broadcastProgress(true);
}

async function stopTracking() {
  endSegment();
  const finalMs = getPlayedMs();
  const snapshot = session
    ? {
        ...session,
        playedMs: finalMs,
        syncedMinutes,
        isPlaying: false,
        lastProgressAt: Date.now(),
      }
    : null;

  // Clear local tracking immediately so the pill stops on click.
  session = null;
  resetTiming();
  lastRenderedTracking = null;
  lastRenderedClock = "";
  lastRenderedStatus = "";
  renderUi();

  if (!snapshot) {
    writingStorage = true;
    await chrome.storage.local.remove(STORAGE_KEY);
    queueMicrotask(() => {
      writingStorage = false;
    });
    try {
      chrome.runtime.sendMessage({ type: "TRACK_STOPPED" });
    } catch {
      /* ignore */
    }
    return;
  }

  writingStorage = true;
  await chrome.storage.local.set({ [STORAGE_KEY]: snapshot });
  try {
    chrome.runtime.sendMessage({ type: "FLUSH_SYNC" }, () => {
      chrome.storage.local.remove(STORAGE_KEY).finally(() => {
        writingStorage = false;
        try {
          chrome.runtime.sendMessage({ type: "TRACK_STOPPED" });
        } catch {
          /* ignore */
        }
      });
    });
  } catch {
    await chrome.storage.local.remove(STORAGE_KEY);
    writingStorage = false;
  }
}

async function toggleTracking() {
  if (toggleBusy) return;
  toggleBusy = true;
  try {
    if (isTrackingHere()) await stopTracking();
    else await startTracking();
  } finally {
    toggleBusy = false;
  }
}

function wireDragAndClick() {
  if (!uiWrap || !uiButton || uiButton.dataset.cdsWired) return;
  uiButton.dataset.cdsWired = "1";

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
    if (!dragMoved) return;
    setWrapPosition(originLeft + dx, originTop + dy, false);
  };

  const onUp = (event) => {
    if (!isDragging) return;
    const shouldToggle = !dragMoved;
    isDragging = false;
    uiWrap.classList.remove("cds-yt-dragging");
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    if (dragMoved) {
      setWrapPosition(parseFloat(uiWrap.style.left) || 0, parseFloat(uiWrap.style.top) || 0, true);
    }
    updateVisibility();
    if (shouldToggle) {
      event.preventDefault();
      event.stopPropagation();
      void toggleTracking();
    }
    dragMoved = false;
  };

  uiButton.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      isDragging = true;
      dragMoved = false;
      startX = event.clientX;
      startY = event.clientY;
      originLeft = parseFloat(uiWrap.style.left) || 0;
      originTop = parseFloat(uiWrap.style.top) || 0;
      uiWrap.classList.add("cds-yt-dragging", "cds-yt-visible");
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    },
    true
  );

  // Prevent YouTube/player from eating the gesture
  uiButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  }, true);
  uiButton.addEventListener("mousedown", (event) => event.stopPropagation(), true);
  uiButton.addEventListener("mouseup", (event) => event.stopPropagation(), true);
}

function buildButtonStructure() {
  uiButton.replaceChildren();
  const dot = document.createElement("span");
  dot.className = "dot";
  timeEl = document.createElement("span");
  timeEl.className = "time";
  statusEl = document.createElement("span");
  statusEl.className = "status";
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "Track study time";
  uiButton.append(dot, timeEl, statusEl, label);
  lastRenderedTracking = false;
  lastRenderedClock = "";
  lastRenderedStatus = "";
}

function wirePlayerVisibility() {
  const player = findYouTubePlayer();
  if (!player || player.dataset.cdsVisWired) return;
  player.dataset.cdsVisWired = "1";
  player.addEventListener("mouseenter", () => {
    playerHovered = true;
    updateVisibility();
  });
  player.addEventListener("mousemove", () => {
    playerHovered = true;
    updateVisibility();
  });
  player.addEventListener("mouseleave", () => {
    if (!isDragging) {
      window.setTimeout(() => {
        playerHovered = false;
        updateVisibility();
      }, 150);
    }
  });
  if (playerObserver) playerObserver.disconnect();
  playerObserver = new MutationObserver(updateVisibility);
  playerObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
}

function wireResize() {
  const player = findYouTubePlayer();
  if (!player || player.dataset.cdsResizeWired) return;
  player.dataset.cdsResizeWired = "1";
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => {
    if (!isDragging) void applySavedPosition();
  });
  resizeObserver.observe(player);
}

function shouldRunInThisFrame() {
  if (isYouTube()) {
    return Boolean(findYouTubePlayer()) || (IS_TOP_FRAME && Boolean(pageVideoId()));
  }
  if (findVideo()) return true;
  // Floating fallback for DRM pages with no accessible <video> — top frame only.
  return IS_TOP_FRAME;
}

function injectUi() {
  if (uiWrap) return;
  if (!shouldRunInThisFrame()) return;
  if (isYouTube() && !new URL(location.href).searchParams.get("v")) return;
  if (!pageVideoId()) return;

  // Only attach inside YouTube's player (already positioned).
  // All other sites use a fixed floating pill — never touch player DOM/CSS.
  const ytPlayer = isYouTube() ? findYouTubePlayer() : null;
  useFloatingUi = !ytPlayer;

  uiWrap = document.createElement("div");
  uiWrap.id = "cds-yt-tracker-wrap";
  if (useFloatingUi) uiWrap.classList.add("cds-vt-floating");

  uiButton = document.createElement("button");
  uiButton.id = "cds-yt-tracker-btn";
  uiButton.type = "button";
  buildButtonStructure();
  uiWrap.appendChild(uiButton);

  if (useFloatingUi) {
    (document.body || document.documentElement).appendChild(uiWrap);
    playerHovered = true;
  } else {
    ytPlayer.appendChild(uiWrap);
    playerShell = ytPlayer;
    wirePlayerVisibility();
    wireResize();
  }

  wireDragAndClick();
  void (async () => {
    await loadSession();
    // Another frame owns this session — don't show a second pill.
    if (session?.ownerId && session.ownerId !== FRAME_ID) {
      removeUi();
      return;
    }
    reconcile();
    renderUi();
    await applySavedPosition();
    updateVisibility();
  })();
}

function ensureUi() {
  if (!shouldRunInThisFrame()) {
    removeUi();
    return;
  }
  if (isYouTube() && !new URL(location.href).searchParams.get("v")) {
    removeUi();
    return;
  }
  if (!pageVideoId()) {
    if (!isTrackingHere()) removeUi();
    return;
  }
  // Hide if another frame owns the active session
  if (session?.ownerId && session.ownerId !== FRAME_ID && isTrackingHere()) {
    removeUi();
    return;
  }
  if (!uiWrap) {
    injectUi();
    return;
  }

  // Never migrate floating UI into non-YouTube players (layout break).
  if (isYouTube()) {
    const ytPlayer = findYouTubePlayer();
    if (ytPlayer && useFloatingUi) {
      useFloatingUi = false;
      uiWrap.classList.remove("cds-vt-floating");
      ytPlayer.appendChild(uiWrap);
      playerShell = ytPlayer;
      wirePlayerVisibility();
      wireResize();
      void applySavedPosition();
    } else if (!ytPlayer && !useFloatingUi) {
      useFloatingUi = true;
      uiWrap.classList.add("cds-vt-floating");
      (document.body || document.documentElement).appendChild(uiWrap);
      void applySavedPosition();
    }
  } else if (!useFloatingUi) {
    useFloatingUi = true;
    uiWrap.classList.add("cds-vt-floating");
    (document.body || document.documentElement).appendChild(uiWrap);
    void applySavedPosition();
  }
  updateVisibility();
}

function removeUi() {
  if (playerObserver) {
    playerObserver.disconnect();
    playerObserver = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  uiWrap?.remove();
  uiWrap = null;
  uiButton = null;
  timeEl = null;
  statusEl = null;
  playerShell = null;
  playerHovered = false;
  useFloatingUi = false;
  lastRenderedTracking = null;
}

function onVideoStateChange() {
  reconcile();
  renderUi();
  if (isTrackingHere() && !isStopwatchRunning()) {
    void persistProgress();
  }
}

function attachVideoListeners() {
  const videos = isYouTube() ? [findVideo()].filter(Boolean) : findAllVideos();
  for (const video of videos) {
    if (wiredVideos.has(video)) continue;
    wiredVideos.add(video);
    for (const name of ["play", "playing", "pause", "ended", "emptied"]) {
      video.addEventListener(name, onVideoStateChange);
    }
  }
}

async function loadSession() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const next = stored[STORAGE_KEY] || null;
  session = next;
  if (!session) {
    resetTiming();
    return;
  }
  syncedMinutes = Math.max(0, Number(session.syncedMinutes) || 0);
  playedMs = Math.max(0, Number(session.playedMs) || 0);
  segmentStart = null;
}

async function tick() {
  if (!shouldRunInThisFrame()) return;
  ensureUi();
  attachVideoListeners();

  if (!session || !isTrackingHere() || !isSessionOwner()) {
    renderUi();
    return;
  }

  reconcile();
  renderUi();

  const now = Date.now();
  const totalMin = Math.floor(getPlayedMs() / 60_000);
  if (totalMin > syncedMinutes) {
    lastSyncAt = now;
    await flushSync();
  } else if (now - lastSyncAt >= SYNC_MS) {
    lastSyncAt = now;
    await flushSync();
  }
  broadcastProgress(false);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY] || writingStorage) return;
  const next = changes[STORAGE_KEY].newValue || null;
  if (!next) {
    endSegment();
    session = null;
    resetTiming();
    lastRenderedTracking = null;
    renderUi();
    return;
  }

  // Another frame owns the stopwatch — mirror time only, never count.
  if (next.ownerId && next.ownerId !== FRAME_ID) {
    endSegment();
    session = next;
    syncedMinutes = Math.max(0, Number(next.syncedMinutes) || 0);
    playedMs = Math.max(0, Number(next.playedMs) || 0);
    segmentStart = null;
    removeUi();
    return;
  }

  if (session && next.videoId === session.videoId && next.startedAt === session.startedAt) {
    syncedMinutes = Math.max(syncedMinutes, Number(next.syncedMinutes) || 0);
    session = {
      ...session,
      ...next,
      ownerId: session.ownerId || next.ownerId,
      playedMs: isSessionOwner() ? getPlayedMs() : Math.max(0, Number(next.playedMs) || 0),
      syncedMinutes,
    };
    if (!isSessionOwner()) {
      playedMs = Math.max(0, Number(next.playedMs) || 0);
      segmentStart = null;
    }
    renderUi();
    return;
  }

  session = next;
  syncedMinutes = Math.max(0, Number(next.syncedMinutes) || 0);
  playedMs = Math.max(0, Number(next.playedMs) || 0);
  segmentStart = null;
  if (isSessionOwner()) reconcile();
  renderUi();
});

let lastNavKey = pageContextKey();
function onNav() {
  const next = pageContextKey();
  if (next === lastNavKey) return;
  if (session && isTrackingHere()) {
    endSegment();
    void flushSync();
  } else {
    endSegment();
  }
  lastNavKey = next;
  removeUi();
  ensureUi();
}

if (isYouTube()) window.addEventListener("yt-navigate-finish", onNav);
window.addEventListener("popstate", onNav);
window.addEventListener("hashchange", onNav);
if (!window.__cdsVtHistoryPatched) {
  window.__cdsVtHistoryPatched = true;
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patched(...args) {
      const result = original.apply(this, args);
      onNav();
      return result;
    };
  }
}

window.addEventListener("resize", () => {
  void applySavedPosition();
});

window.addEventListener("beforeunload", () => {
  if (!session || !isSessionOwner()) return;
  endSegment();
  void persistProgress();
  try {
    chrome.runtime.sendMessage({ type: "FLUSH_SYNC" });
  } catch {
    /* ignore */
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (isSessionOwner()) {
      endSegment();
      void persistProgress();
    }
  } else if (isSessionOwner()) {
    reconcile();
    renderUi();
  }
});

function isCdsAppPage() {
  try {
    if (location.pathname.startsWith("/api/")) return true;
    const port = location.port || (location.protocol === "https:" ? "443" : "80");
    const local =
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(location.hostname);
    if (local && (port === "5173" || port === "5001")) return true;
    if (location.hostname.endsWith(".trycloudflare.com")) return true;
    return false;
  } catch {
    return false;
  }
}

if (!isCdsAppPage()) {
  ensureUi();
  setInterval(() => {
    void tick();
  }, UI_TICK_MS);
}
