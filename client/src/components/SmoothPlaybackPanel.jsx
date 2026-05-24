import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  FiAlertTriangle,
  FiCheck,
  FiHardDrive,
  FiLoader,
  FiTrash2,
  FiZap,
} from "react-icons/fi";
import api from "../api/client";
import { formatFileSize } from "../utils/media";

const SmoothPlaybackPanel = ({
  contentId,
  eligible = false,
  isDark = false,
  onPlayUrlChange,
  onUsingLocalLibraryChange,
}) => {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!contentId || !eligible) return;
    try {
      const { data } = await api.get(`/contents/${contentId}/local-library`);
      setStatus(data);
      if (data.cached && data.ready && data.playUrl) {
        onPlayUrlChange?.(data.playUrl);
        onUsingLocalLibraryChange?.(true);
      } else if (data.job?.status !== "downloading") {
        onPlayUrlChange?.(null);
        onUsingLocalLibraryChange?.(false);
      }
    } catch {
      /* ignore polling errors */
    }
  }, [contentId, eligible, onPlayUrlChange, onUsingLocalLibraryChange]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!eligible || !contentId) return undefined;
    const downloading = status?.job?.status === "downloading";
    if (!downloading && status?.cached) return undefined;
    const interval = setInterval(loadStatus, downloading ? 4000 : 12000);
    return () => clearInterval(interval);
  }, [contentId, eligible, status?.job?.status, status?.cached, loadStatus]);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/contents/${contentId}/local-library`);
      setStatus(data);
      if (data.cached && data.ready && data.playUrl) {
        onPlayUrlChange?.(data.playUrl);
        onUsingLocalLibraryChange?.(true);
        toast.success("Smooth playback ready — playing from your PC.");
      } else {
        toast.success("Downloading to your PC library…");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not start download");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await api.delete(`/contents/${contentId}/local-library`);
      onPlayUrlChange?.(null);
      onUsingLocalLibraryChange?.(false);
      await loadStatus();
      toast.success("Removed from PC library.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not remove file");
    } finally {
      setBusy(false);
    }
  };

  if (!eligible) return null;

  const storage = status?.storage;
  const downloading = status?.job?.status === "downloading";
  const cached = status?.cached && status?.ready;
  const level = storage?.level || "ok";
  const shell = isDark
    ? "border-neutral-800 bg-neutral-950/80"
    : "border-slate-200/90 bg-slate-50/80";

  return (
    <div className={`mt-3 rounded-xl border px-3 py-3 sm:px-4 ${shell}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <FiZap size={13} />
            Smooth playback
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {cached
              ? "Playing from your PC library — no buffering."
              : downloading
                ? `Saving to PC… ${status?.job?.percent ?? 0}%`
                : "Download this lecture to your PC for fast, smooth playback."}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            Study time still syncs to your account — visible on production too.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!cached && (
            <button
              type="button"
              className="btn-primary text-xs!"
              disabled={busy || downloading || level === "full"}
              onClick={handleDownload}
            >
              {downloading || busy ? (
                <>
                  <FiLoader className="animate-spin" size={14} /> Downloading
                </>
              ) : (
                <>
                  <FiZap size={14} /> Smooth playback
                </>
              )}
            </button>
          )}
          {cached && (
            <button type="button" className="btn-secondary text-xs!" disabled={busy} onClick={handleRemove}>
              <FiTrash2 size={14} /> Remove from PC
            </button>
          )}
        </div>
      </div>

      {storage && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <FiHardDrive size={11} />
              PC library
              {storage.unlimited
                ? `: ${storage.usedLabel || formatFileSize(storage.usedBytes)}`
                : `: ${storage.usedLabel || formatFileSize(storage.usedBytes)} / ${storage.maxLabel || formatFileSize(storage.maxBytes)}`}
            </span>
            {!storage.unlimited && (
              <span className="tabular-nums">{storage.usedPercent}%</span>
            )}
          </div>
          {!storage.unlimited && (
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${
                  level === "full"
                    ? "bg-rose-500"
                    : level === "warning"
                      ? "bg-amber-500"
                      : "bg-slate-900 dark:bg-slate-100"
                }`}
                style={{ width: `${Math.min(100, storage.usedPercent)}%` }}
              />
            </div>
          )}
          {level === "warning" && !storage.unlimited && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <FiAlertTriangle size={13} />
              PC library is {storage.usedPercent}% full. Remove old videos to free space.
            </p>
          )}
          {level === "full" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300">
              <FiAlertTriangle size={13} />
              PC library full — remove a saved video before downloading another.
            </p>
          )}
        </div>
      )}

      {cached && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
          <FiCheck size={13} />
          Saved on your PC — replay anytime without re-downloading.
        </p>
      )}

      {downloading && status?.job?.percent != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-sky-500 transition-all"
            style={{ width: `${Math.min(100, status.job.percent)}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default SmoothPlaybackPanel;
