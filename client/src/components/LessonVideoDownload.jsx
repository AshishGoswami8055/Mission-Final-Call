import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiDownload, FiLoader, FiRefreshCw } from "react-icons/fi";
import {
  fetchLocalLibraryStatus,
  replaceLocalLibraryVideo,
  startLocalLibraryDownload,
} from "../utils/localLibraryApi";

const iconBtn =
  "rounded-lg p-2 transition disabled:opacity-50";

const LessonVideoDownload = ({ contentId, onCached, initiallyCached = false }) => {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replacePercent, setReplacePercent] = useState(0);
  const fileInputRef = useRef(null);

  const loadStatus = useCallback(async () => {
    if (!contentId) return;
    try {
      const { data } = await fetchLocalLibraryStatus(contentId);
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
    const interval = setInterval(loadStatus, downloading ? 1000 : 12000);
    return () => clearInterval(interval);
  }, [status?.job?.status, status?.cached, status?.ready, loadStatus]);

  const cached = (status?.cached && status?.ready) || initiallyCached;
  const downloading = status?.job?.status === "downloading";
  const percent = Math.min(100, Math.max(0, Math.round(Number(status?.job?.percent) || 0)));
  const working = busy || replacing || downloading;

  const downloadTitle = cached
    ? "On your PC"
    : downloading
      ? `Downloading ${percent}%`
      : "Download to PC";

  const replaceTitle = replacing ? `Replacing ${replacePercent}%` : "Replace — pick a video from your PC";

  const handleDownload = async (event) => {
    event.stopPropagation();
    if (cached || working) return;
    setBusy(true);
    try {
      const { data } = await startLocalLibraryDownload(contentId);
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

  const handleReplaceClick = (event) => {
    event.stopPropagation();
    if (working) return;
    fileInputRef.current?.click();
  };

  const handleReplaceFile = async (event) => {
    event.stopPropagation();
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || working) return;

    setReplacing(true);
    setReplacePercent(0);
    try {
      const { data } = await replaceLocalLibraryVideo(contentId, file, {
        onUploadProgress: setReplacePercent,
      });
      setStatus(data);
      onCached?.(contentId);
      toast.success(`Linked "${file.name}" to this lesson on your PC.`);
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not replace video");
    } finally {
      setReplacing(false);
      setReplacePercent(0);
    }
  };

  return (
    <div className="flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mkv,.mov,.m4v"
        className="hidden"
        onChange={handleReplaceFile}
      />
      <button
        type="button"
        aria-label={downloadTitle}
        title={downloadTitle}
        className={`${iconBtn} ${
          cached
            ? "text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/30"
            : downloading
              ? "text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/30"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
        }`}
        disabled={cached || working}
        onClick={handleDownload}
      >
        {downloading || busy ? (
          <FiLoader size={15} className="animate-spin" />
        ) : cached ? (
          <FiCheck size={15} />
        ) : (
          <FiDownload size={15} />
        )}
      </button>
      <button
        type="button"
        aria-label={replaceTitle}
        title={replaceTitle}
        className={`${iconBtn} text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30`}
        disabled={working}
        onClick={handleReplaceClick}
      >
        {replacing ? <FiLoader size={15} className="animate-spin" /> : <FiRefreshCw size={15} />}
      </button>
    </div>
  );
};

export default LessonVideoDownload;
