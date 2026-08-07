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
 * Works for same-origin / local files (PC library or 100% stream cache).
 */
export const attachTimelineScrubPreview = ({ rootEl, src, getDuration }) => {
  if (!rootEl || !src) {
    return { destroy: () => {} };
  }

  const progressRoot = rootEl.querySelector(".plyr__progress");
  if (!progressRoot) {
    return { destroy: () => {} };
  }

  const previewWrap = document.createElement("div");
  previewWrap.className = "cds-scrub-preview";
  previewWrap.hidden = true;
  previewWrap.innerHTML =
    '<div class="cds-scrub-preview__frame">' +
    '<img class="cds-scrub-preview__img" alt="" />' +
    '<div class="cds-scrub-preview__loading" aria-hidden="true"></div>' +
    "</div>" +
    '<span class="cds-scrub-preview__time"></span>';
  rootEl.appendChild(previewWrap);

  const imgEl = previewWrap.querySelector(".cds-scrub-preview__img");
  const timeEl = previewWrap.querySelector(".cds-scrub-preview__time");
  const loadingEl = previewWrap.querySelector(".cds-scrub-preview__loading");

  const previewVideo = document.createElement("video");
  previewVideo.muted = true;
  previewVideo.playsInline = true;
  previewVideo.preload = "auto";
  previewVideo.setAttribute("aria-hidden", "true");
  previewVideo.tabIndex = -1;
  previewVideo.style.cssText =
    "position:fixed;width:320px;height:180px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;";
  applyVideoCrossOrigin(previewVideo, src);
  previewVideo.src = src;
  document.body.appendChild(previewVideo);

  const frameCache = new Map();
  const BUCKET_SEC = 2;
  const MAX_CACHE = 100;
  let hoverActive = false;
  let lastBucket = -1;
  let seekTimer = null;
  let seekGeneration = 0;

  const bucketTime = (time) => Math.max(0, Math.floor(time / BUCKET_SEC) * BUCKET_SEC);

  const positionPreview = (clientX) => {
    const hostRect = rootEl.getBoundingClientRect();
    const previewWidth = previewWrap.offsetWidth || 168;
    let left = clientX - hostRect.left - previewWidth / 2;
    left = Math.max(8, Math.min(left, hostRect.width - previewWidth - 8));
    previewWrap.style.left = `${left}px`;
  };

  const showCachedFrame = (bucket, time) => {
    const cached = frameCache.get(bucket);
    if (!cached) return false;
    imgEl.src = cached;
    imgEl.hidden = false;
    loadingEl.hidden = true;
    timeEl.textContent = formatScrubTime(time);
    previewWrap.hidden = false;
    return true;
  };

  const captureAt = async (time, bucket, generation) => {
    if (generation !== seekGeneration) return;

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

      if (generation !== seekGeneration) return;

      if (Math.abs(previewVideo.currentTime - time) > 0.15) {
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

      if (generation !== seekGeneration || !hoverActive) return;

      const dataUrl = captureVideoFrameDataUrl(previewVideo, { maxWidth: 320, quality: 0.72 });
      frameCache.set(bucket, dataUrl);
      if (frameCache.size > MAX_CACHE) {
        const firstKey = frameCache.keys().next().value;
        frameCache.delete(firstKey);
      }

      if (hoverActive && bucket === lastBucket) {
        imgEl.src = dataUrl;
        imgEl.hidden = false;
        loadingEl.hidden = true;
      }
    } catch {
      if (hoverActive && bucket === lastBucket) {
        loadingEl.hidden = true;
        imgEl.hidden = true;
      }
    }
  };

  const scheduleCapture = (time) => {
    const bucket = bucketTime(time);
    timeEl.textContent = formatScrubTime(time);
    previewWrap.hidden = false;

    if (bucket === lastBucket && frameCache.has(bucket)) {
      showCachedFrame(bucket, time);
      return;
    }

    lastBucket = bucket;
    if (showCachedFrame(bucket, time)) return;

    imgEl.hidden = true;
    loadingEl.hidden = false;
    seekGeneration += 1;
    const generation = seekGeneration;
    clearTimeout(seekTimer);
    seekTimer = setTimeout(() => {
      void captureAt(time, bucket, generation);
    }, 60);
  };

  const onMove = (event) => {
    const duration = getDuration();
    if (!duration || duration <= 0) return;

    hoverActive = true;
    const rect = progressRoot.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const time = ratio * duration;

    positionPreview(event.clientX);
    scheduleCapture(time);
  };

  const onLeave = () => {
    hoverActive = false;
    previewWrap.hidden = true;
    clearTimeout(seekTimer);
    seekGeneration += 1;
  };

  progressRoot.addEventListener("mousemove", onMove);
  progressRoot.addEventListener("mouseleave", onLeave);

  const destroy = () => {
    progressRoot.removeEventListener("mousemove", onMove);
    progressRoot.removeEventListener("mouseleave", onLeave);
    clearTimeout(seekTimer);
    previewWrap.remove();
    previewVideo.pause();
    previewVideo.removeAttribute("src");
    previewVideo.load();
    previewVideo.remove();
    frameCache.clear();
  };

  return { destroy };
};
