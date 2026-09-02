/**
 * Capture a JPEG data URL from a playing <video>.
 * Requires crossOrigin="anonymous" on the video when the source is cross-origin.
 */
export const captureVideoFrameDataUrl = (video, { maxWidth = 1280, quality = 0.82 } = {}) => {
  if (!video) throw new Error("Video element not found");
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("Video frame is not ready yet");
  }

  const canvas = document.createElement("canvas");
  const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
  canvas.width = Math.floor(video.videoWidth * scale);
  canvas.height = Math.floor(video.videoHeight * scale);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create canvas context");

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    return canvas.toDataURL("image/jpeg", quality);
  } catch (error) {
    const message = String(error?.message || error || "");
    if (/tainted|cross-origin|security/i.test(message)) {
      throw new Error("Browser blocked screenshot (cross-origin video). Try smooth playback / PC library.");
    }
    throw error;
  }
};

/** Resolve the active <video> inside a Plyr shell (fallback if ref is stale). */
export const resolvePlyrVideoElement = (videoRef, playerShellRef) => {
  const fromRef = videoRef?.current;
  if (fromRef?.videoWidth && fromRef.videoHeight) return fromRef;

  const fromDom = playerShellRef?.current?.querySelector("video");
  if (fromDom?.videoWidth && fromDom.videoHeight) return fromDom;

  return fromRef || fromDom || null;
};

/** crossOrigin only when needed — avoids breaking same-origin / no-cors media playback. */
export const applyVideoCrossOrigin = (video, src = "", mode = "auto") => {
  if (!video) return;
  if (mode === "none" || !src || typeof window === "undefined") {
    video.removeAttribute("crossorigin");
    return;
  }
  try {
    const parsed = new URL(src, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      video.crossOrigin = "anonymous";
    } else {
      video.removeAttribute("crossorigin");
    }
  } catch {
    video.removeAttribute("crossorigin");
  }
};

export const applyVideoSource = (video, src, appliedRef, crossOriginMode = "auto") => {
  if (!video || !src || appliedRef.current === src) return false;
  const shouldResume = !video.paused && !video.ended;
  applyVideoCrossOrigin(video, src, crossOriginMode);
  appliedRef.current = src;
  video.src = src;
  video.load();
  if (shouldResume) {
    const resume = () => {
      video.removeEventListener("loadeddata", resume);
      video.removeEventListener("canplay", resume);
      void video.play().catch(() => {});
    };
    video.addEventListener("loadeddata", resume, { once: true });
    video.addEventListener("canplay", resume, { once: true });
  }
  return true;
};

/** Seek after metadata/canplay is ready; retries deep seeks on large local MP4 files. */
export const seekVideoTo = (video, targetSeconds, { tolerance = 2, maxAttempts = 5 } = {}) =>
  new Promise((resolve) => {
    if (!video || !Number.isFinite(targetSeconds) || targetSeconds <= 0) {
      resolve(false);
      return;
    }

    let attempts = 0;
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const nearTarget = () => Math.abs(video.currentTime - targetSeconds) <= tolerance;

    const scheduleRetry = () => {
      if (attempts >= maxAttempts) {
        finish(nearTarget());
        return;
      }
      window.setTimeout(trySeek, video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA ? 120 : 400);
    };

    const trySeek = () => {
      if (settled) return;
      attempts += 1;

      if (nearTarget()) {
        finish(true);
        return;
      }

      const onSeeked = () => {
        cleanup();
        if (nearTarget()) {
          finish(true);
          return;
        }
        scheduleRetry();
      };

      const onError = () => {
        cleanup();
        scheduleRetry();
      };

      const cleanup = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };

      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);

      try {
        video.currentTime = targetSeconds;
      } catch {
        cleanup();
        scheduleRetry();
      }
    };

    const start = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        trySeek();
        return;
      }
      const onCanPlay = () => {
        video.removeEventListener("canplay", onCanPlay);
        trySeek();
      };
      video.addEventListener("canplay", onCanPlay, { once: true });
      window.setTimeout(() => {
        video.removeEventListener("canplay", onCanPlay);
        if (settled) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          trySeek();
          return;
        }
        finish(false);
      }, 8000);
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      start();
    } else {
      video.addEventListener("loadedmetadata", start, { once: true });
    }
  });

/** Reload element and restore playback time once metadata is available again. */
export const reloadVideoPreservingTime = (video, targetSeconds, { shouldPlay } = {}) => {
  if (!video) return;
  const resumeAt = Number.isFinite(targetSeconds) && targetSeconds > 0 ? targetSeconds : 0;
  const resumePlay = shouldPlay ?? (!video.paused && !video.ended);
  const onMeta = () => {
    video.removeEventListener("loadedmetadata", onMeta);
    const finish = () => {
      if (resumePlay) void video.play().catch(() => {});
    };
    if (resumeAt > 0) {
      void seekVideoTo(video, resumeAt).then(finish);
      return;
    }
    finish();
  };
  video.addEventListener("loadedmetadata", onMeta, { once: true });
  video.load();
};
