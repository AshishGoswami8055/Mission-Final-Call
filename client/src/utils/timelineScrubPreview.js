import { applyVideoCrossOrigin, captureVideoFrameDataUrl } from "./videoScreenshot";

const formatScrubTime = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (value) => value.toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(mins)}:${pad(secs)}`;
  return `${mins}:${pad(secs)}`;
};

/**
 * YouTube-style hover previews on the Plyr timeline.
 * Best for same-origin / cached / local files — not large HTTP range streams.
 */
export const attachTimelineScrubPreview = ({ rootEl, src, getDuration }) => {
  if (!rootEl || !src) {
    return { destroy: () => {} };
  }

  const progressRoot = rootEl.querySelector(".plyr__progress");
  const progressContainer =
    rootEl.querySelector(".plyr__progress__container") || progressRoot?.parentElement;
  if (!progressRoot || !progressContainer) {
    return { destroy: () => {} };
  }

  progressContainer.classList.add("cds-scrub-progress-host");

  const previewWrap = document.createElement("div");
  previewWrap.className = "cds-scrub-preview";
  previewWrap.hidden = true;
  previewWrap.innerHTML =
    '<div class="cds-scrub-preview__frame">' +
    '<img class="cds-scrub-preview__img" alt="" decoding="async" />' +
    '<div class="cds-scrub-preview__loading" aria-hidden="true"></div>' +
    "</div>" +
    '<span class="cds-scrub-preview__time"></span>';
  progressContainer.appendChild(previewWrap);

  const imgEl = previewWrap.querySelector(".cds-scrub-preview__img");
  const timeEl = previewWrap.querySelector(".cds-scrub-preview__time");
  const loadingEl = previewWrap.querySelector(".cds-scrub-preview__loading");

  const previewVideo = document.createElement("video");
  previewVideo.muted = true;
  previewVideo.playsInline = true;
  previewVideo.preload = "metadata";
  previewVideo.setAttribute("aria-hidden", "true");
  previewVideo.tabIndex = -1;
  previewVideo.style.cssText =
    "position:fixed;width:320px;height:180px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;";
  applyVideoCrossOrigin(previewVideo, src);
  previewVideo.src = src;
  document.body.appendChild(previewVideo);

  const frameCache = new Map();
  const BUCKET_SEC = 2;
  const MAX_CACHE = 80;
  let hoverActive = false;
  let activeTime = -1;
  let activeBucket = -1;
  let seekTimer = null;
  let seekGeneration = 0;
  let previewReady = false;

  const bucketTime = (time) => Math.max(0, Math.floor(time / BUCKET_SEC) * BUCKET_SEC);

  const setHoverState = (active) => {
    hoverActive = active;
    rootEl.classList.toggle("cds-scrub-hover", active);
    if (!active) {
      previewWrap.hidden = true;
      imgEl.removeAttribute("src");
      imgEl.hidden = true;
      loadingEl.hidden = true;
      activeTime = -1;
      activeBucket = -1;
      clearTimeout(seekTimer);
      seekGeneration += 1;
    }
  };

  const positionPreview = (clientX) => {
    const rect = progressRoot.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    previewWrap.style.left = `${ratio * 100}%`;
  };

  const canShowFrame = (time, bucket, generation) =>
    hoverActive && generation === seekGeneration && bucket === activeBucket && Math.abs(time - activeTime) < BUCKET_SEC + 0.5;

  const showCachedFrame = (time, bucket, generation) => {
    const cached = frameCache.get(bucket);
    if (!cached || !canShowFrame(time, bucket, generation)) return false;

    imgEl.src = cached;
    imgEl.hidden = false;
    loadingEl.hidden = true;
    timeEl.textContent = formatScrubTime(time);
    previewWrap.hidden = false;
    return true;
  };

  const captureAt = async (time, bucket, generation) => {
    if (!canShowFrame(time, bucket, generation)) return;

    try {
      if (previewVideo.readyState < 1) {
        await new Promise((resolve, reject) => {
          const onMeta = () => {
            previewVideo.removeEventListener("loadedmetadata", onMeta);
            previewVideo.removeEventListener("error", onErr);
            resolve();
          };
          const onErr = () => {
            previewVideo.removeEventListener("loadedmetadata", onMeta);
            previewVideo.removeEventListener("error", onErr);
            reject(new Error("Preview video failed to load"));
          };
          previewVideo.addEventListener("loadedmetadata", onMeta);
          previewVideo.addEventListener("error", onErr);
        });
      }

      if (!canShowFrame(time, bucket, generation)) return;

      if (Math.abs(previewVideo.currentTime - time) > 0.2) {
        await new Promise((resolve, reject) => {
          const onSeeked = () => {
            previewVideo.removeEventListener("seeked", onSeeked);
            previewVideo.removeEventListener("error", onErr);
            resolve();
          };
          const onErr = () => {
            previewVideo.removeEventListener("seeked", onSeeked);
            previewVideo.removeEventListener("error", onErr);
            reject(new Error("Preview seek failed"));
          };
          previewVideo.addEventListener("seeked", onSeeked);
          previewVideo.addEventListener("error", onErr);
          previewVideo.currentTime = time;
        });
      }

      if (!canShowFrame(time, bucket, generation)) return;

      const dataUrl = captureVideoFrameDataUrl(previewVideo, { maxWidth: 320, quality: 0.72 });
      frameCache.set(bucket, dataUrl);
      if (frameCache.size > MAX_CACHE) {
        const firstKey = frameCache.keys().next().value;
        frameCache.delete(firstKey);
      }

      if (!canShowFrame(time, bucket, generation)) return;

      imgEl.src = dataUrl;
      imgEl.hidden = false;
      loadingEl.hidden = true;
      timeEl.textContent = formatScrubTime(time);
      previewWrap.hidden = false;
      previewReady = true;
    } catch {
      if (canShowFrame(time, bucket, generation)) {
        loadingEl.hidden = true;
        imgEl.hidden = true;
        timeEl.textContent = formatScrubTime(time);
        previewWrap.hidden = false;
      }
    }
  };

  const scheduleCapture = (time) => {
    const bucket = bucketTime(time);
    activeTime = time;
    activeBucket = bucket;
    timeEl.textContent = formatScrubTime(time);
    previewWrap.hidden = false;

    seekGeneration += 1;
    const generation = seekGeneration;

    if (showCachedFrame(time, bucket, generation)) return;

    imgEl.hidden = true;
    loadingEl.hidden = previewReady;
    clearTimeout(seekTimer);
    seekTimer = setTimeout(() => {
      void captureAt(time, bucket, generation);
    }, previewReady ? 90 : 160);
  };

  const onMove = (event) => {
    const duration = getDuration();
    if (!duration || duration <= 0) return;

    setHoverState(true);
    const rect = progressRoot.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const time = ratio * duration;

    positionPreview(event.clientX);
    scheduleCapture(time);
  };

  const onLeave = () => {
    setHoverState(false);
  };

  const onWindowBlur = () => {
    setHoverState(false);
  };

  progressRoot.addEventListener("pointerenter", onMove);
  progressRoot.addEventListener("pointermove", onMove);
  progressRoot.addEventListener("pointerleave", onLeave);
  progressRoot.addEventListener("pointercancel", onLeave);
  window.addEventListener("blur", onWindowBlur);

  const destroy = () => {
    progressRoot.removeEventListener("pointerenter", onMove);
    progressRoot.removeEventListener("pointermove", onMove);
    progressRoot.removeEventListener("pointerleave", onLeave);
    progressRoot.removeEventListener("pointercancel", onLeave);
    window.removeEventListener("blur", onWindowBlur);
    clearTimeout(seekTimer);
    progressContainer.classList.remove("cds-scrub-progress-host");
    rootEl.classList.remove("cds-scrub-hover");
    previewWrap.remove();
    previewVideo.pause();
    previewVideo.removeAttribute("src");
    previewVideo.load();
    previewVideo.remove();
    frameCache.clear();
  };

  return { destroy };
};
