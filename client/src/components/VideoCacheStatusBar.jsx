import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiHardDrive, FiLoader, FiZap } from "react-icons/fi";
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
    slate: isDark
      ? "border-white/15 bg-black/60 text-slate-300"
      : "border-slate-200/90 bg-white/95 text-slate-600",
  };
  return `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm ${tones[tone]}`;
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
}) => {
  const [streamStatus, setStreamStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!contentId || !isLocalFrontend() || !isTelegramStream) {
      setStreamStatus(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await fetchContentStreamCache(contentId);
      setStreamStatus(data);
    } catch {
      setStreamStatus(null);
    } finally {
      setLoading(false);
    }
  }, [contentId, isTelegramStream]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    if (!contentId || !isTelegramStream || !isLocalFrontend()) return undefined;
    const interval = setInterval(() => {
      void load();
    }, 12000);
    return () => clearInterval(interval);
  }, [contentId, isTelegramStream, load]);

  if (!isLocalFrontend()) return null;

  const showStream = isTelegramStream;
  const streamComplete = streamStatus?.complete;
  const streamPartial = streamStatus?.cached && !streamStatus?.complete;
  const streamEmpty = showStream && !loading && !streamStatus?.cached;

  const overlay = variant === "overlay";

  if (overlay) {
    if (!pcLibraryActive && !showStream) return null;
    if (showStream && loading && !streamStatus && !pcLibraryActive) return null;

    return (
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5 md:left-3 md:top-3">
        {pcLibraryActive ? (
          <span className={badgeShell("emerald", isDark)}>
            <FiCheck size={12} /> On PC
          </span>
        ) : null}
        {showStream && streamComplete ? (
          <span className={badgeShell("emerald", isDark)}>
            <FiHardDrive size={12} /> Cached 100%
          </span>
        ) : null}
        {showStream && streamPartial ? (
          <span className={badgeShell("sky", isDark)}>
            <FiZap size={12} /> Cached {streamStatus.cachedPercent}%
          </span>
        ) : null}
        {showStream && streamEmpty ? (
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
              <div className="flex items-center gap-2">
                {loading && !streamStatus ? (
                  <FiLoader size={14} className="animate-spin shrink-0 text-sky-500" />
                ) : (
                  <FiZap size={14} className="shrink-0 text-sky-600 dark:text-sky-400" />
                )}
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
              </div>
              {streamPartial || streamComplete ? (
                <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${
                      streamComplete ? "bg-emerald-500" : "bg-sky-500"
                    }`}
                    style={{ width: `${streamStatus.cachedPercent}%` }}
                  />
                </div>
              ) : null}
            </div>
            <Link
              to="/settings/pc-media#stream-cache"
              className="btn-secondary pointer-events-auto shrink-0 text-xs"
            >
              Open folder
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default VideoCacheStatusBar;
