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

/** crossOrigin only when needed — avoids breaking same-origin Telegram streams. */
export const applyVideoCrossOrigin = (video, src = "") => {
  if (!video) return;
  if (!src || typeof window === "undefined") {
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

export const applyVideoSource = (video, src, appliedRef) => {
  if (!video || !src || appliedRef.current === src) return false;
  applyVideoCrossOrigin(video, src);
  appliedRef.current = src;
  video.src = src;
  video.load();
  return true;
};
