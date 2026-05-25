import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiDownload, FiLoader } from "react-icons/fi";
import api from "../api/client";

const LessonVideoDownload = ({ contentId, onCached, initiallyCached = false }) => {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!contentId) return;
    try {
      const { data } = await api.get(`/contents/${contentId}/local-library`);
      setStatus(data);
      if (data.cached && data.ready) onCached?.(contentId);
    } catch {
      /* ignore poll errors */
    }
  }, [contentId, onCached]);

  useEffect(() => {
    if (initiallyCached) {
      setStatus({ cached: true, ready: true, job: null });
      return;
    }
    loadStatus();
  }, [initiallyCached, loadStatus]);

  useEffect(() => {
    const downloading = status?.job?.status === "downloading";
    if (!downloading && status?.cached && status?.ready) return undefined;
    const interval = setInterval(loadStatus, downloading ? 3000 : 12000);
    return () => clearInterval(interval);
  }, [status?.job?.status, status?.cached, status?.ready, loadStatus]);

  const cached = (status?.cached && status?.ready) || initiallyCached;
  const downloading = status?.job?.status === "downloading";
  const percent = Math.min(100, Math.max(0, Math.round(Number(status?.job?.percent) || 0)));

  const handleDownload = async (event) => {
    event.stopPropagation();
    if (cached || downloading || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/contents/${contentId}/local-library`);
      setStatus(data);
      if (data.cached && data.ready) {
        onCached?.(contentId);
        toast.success("Saved to your PC library.");
      } else {
        toast.success("Download started…");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not start download");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full min-w-[88px] shrink-0 sm:w-auto" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={cached ? "On PC" : downloading ? "Downloading" : "Download to PC"}
        title={cached ? "On your PC" : downloading ? `Downloading ${percent}%` : "Download to PC"}
        className={`inline-flex w-full items-center justify-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold transition sm:w-auto ${
          cached
            ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/30 dark:text-violet-300"
            : downloading
              ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-300"
              : "border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-[#141414] dark:text-slate-300 dark:hover:border-white/20"
        }`}
        disabled={cached || downloading || busy}
        onClick={handleDownload}
      >
        {downloading || busy ? (
          <FiLoader size={14} className="animate-spin" />
        ) : cached ? (
          <FiCheck size={14} />
        ) : (
          <FiDownload size={14} />
        )}
        <span className="hidden sm:inline">
          {cached ? "On PC" : downloading ? `${percent}%` : "Download"}
        </span>
      </button>
      {downloading && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-sky-500 transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default LessonVideoDownload;
