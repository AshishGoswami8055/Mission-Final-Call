import { useCallback, useEffect, useRef } from "react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import "../styles/plyr-overrides.css";
import { applyVideoSource } from "../utils/videoScreenshot";

const STALL_RETRY_MS = 18000;
const MAX_STALL_RETRIES = 2;

/**
 * Plyr wrapper that owns the <video> element imperatively so React never
 * reconciles nodes Plyr moves. Mount once per lesson (key={contentId}).
 */
const CdsPlyrPlayer = ({
  contentId,
  src = "",
  ready = true,
  videoRef: externalVideoRef,
  onScreenshot,
  onLoadStart,
  onLoadedMetadata,
  onDurationChange,
  onProgress,
  onError,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onStalled,
}) => {
  const hostRef = useRef(null);
  const plyrRef = useRef(null);
  const internalVideoRef = useRef(null);
  const appliedSrcRef = useRef("");
  const srcRef = useRef(src);
  const stallTimerRef = useRef(null);
  const stallRetriesRef = useRef(0);
  const lastProgressAtRef = useRef(Date.now());
  const onScreenshotRef = useRef(onScreenshot);
  const eventRefs = useRef({
    onLoadStart,
    onLoadedMetadata,
    onDurationChange,
    onProgress,
    onError,
    onTimeUpdate,
    onPlay,
    onPause,
    onEnded,
    onStalled,
  });

  srcRef.current = src;

  useEffect(() => {
    onScreenshotRef.current = onScreenshot;
    eventRefs.current = {
      onLoadStart,
      onLoadedMetadata,
      onDurationChange,
      onProgress,
      onError,
      onTimeUpdate,
      onPlay,
      onPause,
      onEnded,
      onStalled,
    };
  });

  const assignVideoRef = useCallback(
    (el) => {
      internalVideoRef.current = el;
      if (externalVideoRef) externalVideoRef.current = el;
    },
    [externalVideoRef]
  );

  const clearStallTimer = () => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  const scheduleStallWatch = useCallback((video) => {
    clearStallTimer();
    if (!video || !srcRef.current) return;

    stallTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastProgressAtRef.current;
      if (elapsed < STALL_RETRY_MS - 500) {
        scheduleStallWatch(video);
        return;
      }
      if (stallRetriesRef.current >= MAX_STALL_RETRIES) {
        eventRefs.current.onStalled?.({ retries: stallRetriesRef.current, gaveUp: true });
        return;
      }
      stallRetriesRef.current += 1;
      eventRefs.current.onStalled?.({ retries: stallRetriesRef.current, gaveUp: false });
      const currentSrc = srcRef.current;
      appliedSrcRef.current = "";
      applyVideoSource(video, currentSrc, appliedSrcRef);
      scheduleStallWatch(video);
    }, STALL_RETRY_MS);
  }, []);

  const touchProgress = useCallback(
    (video) => {
      lastProgressAtRef.current = Date.now();
      scheduleStallWatch(video);
    },
    [scheduleStallWatch]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !ready || !contentId) return undefined;

    let cancelled = false;
    let player = null;
    let video = null;
    let screenshotBtn = null;
    let onScreenshotClick = null;

    const handlers = {
      loadstart: () => {
        touchProgress(video);
        eventRefs.current.onLoadStart?.();
      },
      loadedmetadata: () => {
        touchProgress(video);
        stallRetriesRef.current = 0;
        eventRefs.current.onLoadedMetadata?.();
      },
      durationchange: () => eventRefs.current.onDurationChange?.(),
      progress: () => {
        touchProgress(video);
        eventRefs.current.onProgress?.();
      },
      error: () => eventRefs.current.onError?.(),
      timeupdate: () => {
        touchProgress(video);
        eventRefs.current.onTimeUpdate?.();
      },
      play: () => {
        touchProgress(video);
        eventRefs.current.onPlay?.();
      },
      pause: () => eventRefs.current.onPause?.(),
      ended: () => eventRefs.current.onEnded?.(),
      waiting: () => {
        touchProgress(video);
        eventRefs.current.onStalled?.({ retries: stallRetriesRef.current, waiting: true });
      },
      stalled: () => {
        touchProgress(video);
        eventRefs.current.onStalled?.({ retries: stallRetriesRef.current, stalled: true });
      },
    };

    const cleanupDom = () => {
      clearStallTimer();
      if (video) {
        Object.entries(handlers).forEach(([event, handler]) => {
          video.removeEventListener(event, handler);
        });
      }
      if (screenshotBtn && onScreenshotClick) {
        screenshotBtn.removeEventListener("click", onScreenshotClick);
      }
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      player = null;
      plyrRef.current = null;
      if (host) {
        while (host.firstChild) {
          host.removeChild(host.firstChild);
        }
      }
      if (internalVideoRef.current === video) {
        assignVideoRef(null);
      }
      appliedSrcRef.current = "";
      stallRetriesRef.current = 0;
    };

    const rafId = requestAnimationFrame(() => {
      if (cancelled || !host.isConnected) return;

      video = document.createElement("video");
      video.className = "aspect-video w-full";
      video.setAttribute("playsinline", "");
      video.preload = "auto";
      video.controls = false;
      const track = document.createElement("track");
      track.kind = "captions";
      video.appendChild(track);

      host.appendChild(video);
      assignVideoRef(video);

      Object.entries(handlers).forEach(([event, handler]) => {
        video.addEventListener(event, handler);
      });

      if (srcRef.current) {
        applyVideoSource(video, srcRef.current, appliedSrcRef);
        touchProgress(video);
      }

      if (cancelled || !host.isConnected) {
        cleanupDom();
        return;
      }

      player = new Plyr(video, {
        seekTime: 5,
        keyboard: { focused: true, global: true },
        clickToPlay: true,
        controls: [
          "play-large",
          "rewind",
          "play",
          "fast-forward",
          "progress",
          "current-time",
          "duration",
          "mute",
          "volume",
          "settings",
          "pip",
          "fullscreen",
        ],
        settings: ["speed"],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
        tooltips: { controls: true, seek: true },
        ratio: "16:9",
        storage: { enabled: false },
      });
      plyrRef.current = player;

      const injectScreenshotButton = () => {
        const controls = player?.elements?.controls;
        if (!controls || controls.querySelector(".plyr-screenshot-btn")) return;
        screenshotBtn = document.createElement("button");
        screenshotBtn.type = "button";
        screenshotBtn.className = "plyr__controls__item plyr__control plyr-screenshot-btn";
        screenshotBtn.setAttribute("aria-label", "Screenshot");
        screenshotBtn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="presentation" focusable="false"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>' +
          '<span class="plyr__tooltip" role="tooltip">Screenshot</span>';
        onScreenshotClick = () => onScreenshotRef.current?.();
        screenshotBtn.addEventListener("click", onScreenshotClick);
        const fullscreenBtn = controls.querySelector('[data-plyr="fullscreen"]');
        controls.insertBefore(screenshotBtn, fullscreenBtn || null);
      };

      player.on("ready", injectScreenshotButton);
      window.setTimeout(injectScreenshotButton, 0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      cleanupDom();
    };
  }, [contentId, ready, assignVideoRef, touchProgress]);

  // Apply / refresh src when it becomes available or changes (fixes rAF race on refresh).
  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video || !ready || !src) return;
    if (applyVideoSource(video, src, appliedSrcRef)) {
      touchProgress(video);
    }
  }, [src, ready, touchProgress]);

  return (
    <div
      ref={hostRef}
      className="overflow-hidden rounded-xl relative aspect-video w-full bg-black"
      data-cds-plyr-host={contentId || "pending"}
    />
  );
};

export default CdsPlyrPlayer;
