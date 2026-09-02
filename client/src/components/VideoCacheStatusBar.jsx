import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiActivity,
  FiCheck,
  FiHardDrive,
  FiLoader,
  FiPause,
  FiRefreshCw,
  FiZap,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { fetchContentStreamCache } from "../utils/mediaStorageApi";
import { isLocalFrontend } from "../utils/media";

const badgeShell = (tone, isDark) => {
  const tones = {
    emerald: isDark
      ? "border-emerald-500/40 bg-emerald-950/70 text-emerald-200"
      : "border-emerald-200 bg-emerald-50/95 text-emerald-800",
    sky: isDark
      ? "border-sky-500/40 bg-sky-950/70 text-sky-200"
      : "border-sky-200 bg-sky-50/95 text-sky-800",
    amber: isDark
      ? "border-amber-500/40 bg-amber-950/70 text-amber-200"
      : "border-amber-200 bg-amber-50/95 text-amber-800",
    slate: isDark
      ? "border-white/15 bg-black/60 text-slate-300"
      : "border-slate-200/90 bg-white/95 text-slate-600",
  };
  return `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm ${tones[tone]}`;
};

const activityMeta = (activity, growing, stalled, playbackActive = 0) => {
  if (activity === "complete") {
    return {
      label: "Complete",
      detail: "Full file saved on your PC — smooth replay and seek",
      tone: "emerald",
      pulse: false,
      icon: FiCheck,
    };
  }
  if (activity === "running" || growing) {
    return {
      label: playbackActive > 0 ? "Caching while you watch" : "Caching now",
      detail:
        playbackActive > 0
          ? "Saving ahead in the background for smooth replay and seek"
          : "Downloading chunks to your PC in the background",
      tone: "sky",
      pulse: true,
      icon: FiLoader,
    };
  }
  if (activity === "paused") {
    return {
      label: playbackActive > 0 ? "Caching while you watch" : "Starting prefetch",
      detail:
        playbackActive > 0
          ? "Saving the next chunk — may wait briefly while the stream connects"
          : "Queueing the next cache segment…",
      tone: "sky",
      pulse: true,
      icon: FiActivity,
    };
  }
  if (activity === "warming") {
    return {
      label: "Starting soon",
      detail: "Background cache will begin shortly",
      tone: "sky",
      pulse: true,
      icon: FiActivity,
    };
  }
  if (stalled) {
    return {
      label: "Idle",
      detail: "Seek or keep watching to cache more",
      tone: "slate",
      pulse: false,
      icon: FiPause,
    };
  }
  return {
    label: "Waiting",
    detail: "Cache builds while you watch and seek",
    tone: "slate",
    pulse: false,
    icon: FiZap,
  };
};

const pollIntervalMs = (activity, partial) => {
  if (activity === "running" || activity === "warming") return 2000;
  if (activity === "paused" || partial) return 3000;
  return 8000;
};

/**
 * Shows PC library + stream cache status on the video page.
 */
const VideoCacheStatusBar = ({
  contentId,
  isTelegramStream = false,
  pcLibraryActive = false,
  isDark = false,
  variant = "panel",
  refreshToken = 0,
  onStatus,
}) => {
  const [streamStatus, setStreamStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [growing, setGrowing] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [tick, setTick] = useState(0);
  const lastBytesRef = useRef(null);
  const lastChangeAtRef = useRef(Date.now());
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const load = useCallback(async () => {
    if (!contentId || !isLocalFrontend() || !isTelegramStream) {
      setStreamStatus(null);
      return null;
    }
    setLoading(true);
    try {
      const { data } = await fetchContentStreamCache(contentId);
      setStreamStatus(data);
      setLastSyncAt(Date.now());
      onStatusRef.current?.(data);

      const bytes = Number(data?.cachedBytes) || 0;
      if (lastBytesRef.current != null && bytes > lastBytesRef.current) {
        lastChangeAtRef.current = Date.now();
        setGrowing(true);
        setStalled(false);
      } else if (bytes === lastBytesRef.current) {
        setGrowing(false);
      }
      lastBytesRef.current = bytes;
      return data;
    } catch {
      setStreamStatus(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [contentId, isTelegramStream]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    if (!contentId || !isTelegramStream || !isLocalFrontend()) return undefined;
    if (streamStatus?.complete && !streamStatus?.optimizingPlayback) return undefined;

    let cancelled = false;
    let timer = null;

    const schedule = async () => {
      const data = await load();
      if (cancelled || (data?.complete && !data?.optimizingPlayback)) return;
      const interval = data?.optimizingPlayback
        ? 2000
        : pollIntervalMs(data?.activity, data?.cached && !data?.complete);
      timer = window.setTimeout(schedule, interval);
    };

    void schedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [contentId, isTelegramStream, load, streamStatus?.complete, streamStatus?.optimizingPlayback]);

  useEffect(() => {
    if (streamStatus?.complete) return undefined;
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [streamStatus?.complete]);

  useEffect(() => {
    if (streamStatus?.complete) {
      setStalled(false);
      setGrowing(false);
      return undefined;
    }
    const interval = window.setInterval(() => {
      const idleForMs = Date.now() - lastChangeAtRef.current;
      const partial = streamStatus?.cached && !streamStatus?.complete;
      const active = streamStatus?.activity === "running" || streamStatus?.activity === "warming";
      setStalled(Boolean(partial && !active && idleForMs > 20000));
      if (idleForMs > 4000) setGrowing(false);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [streamStatus?.activity, streamStatus?.cached, streamStatus?.complete]);

  if (!isLocalFrontend()) return null;

  const showStream = isTelegramStream;
  const streamComplete = streamStatus?.complete;
  const streamPartial = streamStatus?.cached && !streamStatus?.complete;
  const streamEmpty = showStream && !loading && !streamStatus?.cached;
  const activity = streamStatus?.activity || "idle";
  const live = activityMeta(
    activity,
    growing,
    stalled,
    Number(streamStatus?.playbackActive) || 0
  );
  const LiveIcon = live.icon;
  const secondsSinceSync =
    lastSyncAt && tick >= 0
      ? Math.max(0, Math.floor((Date.now() - lastSyncAt) / 1000))
      : null;

  const overlay = variant === "overlay";

  if (overlay) {
    if (!showStream) return null;
    if (loading && !streamStatus) return null;

    // Only show on-video badges while cache is still building — completed state lives in the panel below.
    const showActiveCacheBadge = streamPartial || streamEmpty;
    if (!showActiveCacheBadge) return null;

    return (
      <div
        className="pointer-events-auto absolute bottom-12 left-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5 md:bottom-14 md:left-3"
        data-cds-ignore-fs-dblclick
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {streamPartial ? (
          <span className={badgeShell(live.tone, isDark)}>
            {live.pulse ? (
              <LiveIcon size={12} className="animate-spin" />
            ) : (
              <LiveIcon size={12} />
            )}
            {live.label} {streamStatus.cachedPercent}%
          </span>
        ) : null}
        {streamEmpty ? (
          <span className={badgeShell("slate", isDark)}>
            <FiZap size={12} /> Caching as you watch
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-sm ${
        isDark
          ? "border-neutral-800 bg-neutral-950/80 text-slate-300"
          : "border-slate-200/90 bg-slate-50/80 text-slate-700"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Storage on your PC</p>
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FiHardDrive size={14} className="shrink-0 text-violet-600 dark:text-violet-400" />
            <span>
              <strong>PC library</strong>
              {" — "}
              {pcLibraryActive ? (
                <span className="text-emerald-600 dark:text-emerald-400">Downloaded (permanent)</span>
              ) : (
                <span className="text-slate-500">Not downloaded</span>
              )}
            </span>
          </div>
        </div>

        {showStream ? (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    live.tone === "emerald"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : live.tone === "sky"
                        ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        : live.tone === "amber"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  }`}
                >
                  {live.pulse ? (
                    <LiveIcon size={11} className="animate-spin" />
                  ) : (
                    <LiveIcon size={11} />
                  )}
                  {live.label}
                </span>
                {secondsSinceSync != null && !streamComplete ? (
                  <span className="text-[11px] text-slate-400" aria-live="polite">
                    Updated {secondsSinceSync}s ago
                  </span>
                ) : null}
              </div>

              <div className="mt-2 flex items-start gap-2">
                <FiZap size={14} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" />
                <div className="min-w-0">
                  <span>
                    <strong>Stream cache</strong>
                    {" — "}
                    {streamComplete ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Full file on disk ({streamStatus.totalLabel})
                      </span>
                    ) : streamPartial ? (
                      <span className="text-sky-700 dark:text-sky-300">
                        {streamStatus.cachedPercent}% saved ({streamStatus.cachedLabel} of{" "}
                        {streamStatus.totalLabel})
                      </span>
                    ) : (
                      <span className="text-slate-500">Builds while you watch & seek</span>
                    )}
                  </span>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{live.detail}</p>
                </div>
              </div>

              {streamPartial || streamComplete ? (
                <div className="mt-2 max-w-md">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        streamComplete
                          ? "bg-emerald-500"
                          : live.pulse
                            ? "animate-pulse bg-sky-500"
                            : stalled
                              ? "bg-amber-500"
                              : "bg-sky-500"
                      }`}
                      style={{ width: `${streamStatus.cachedPercent}%` }}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span>{streamStatus.cachedPercent}% on disk</span>
                    {streamStatus.queueLength > 0 ? (
                      <span>{streamStatus.queueLength} cache task(s) queued</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                className="btn-secondary pointer-events-auto text-xs disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void load()}
                disabled={loading || streamComplete}
                title={streamComplete ? "Cache complete — refresh not needed" : "Refresh cache status"}
              >
                {loading ? <FiLoader className="animate-spin" /> : <FiRefreshCw />}
                Refresh
              </button>
              <Link
                to="/settings/pc-media#stream-cache"
                className="btn-secondary pointer-events-auto text-center text-xs"
              >
                Open folder
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default VideoCacheStatusBar;
