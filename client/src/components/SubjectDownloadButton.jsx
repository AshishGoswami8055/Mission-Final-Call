import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiDownload, FiLoader, FiZap } from "react-icons/fi";
import { isLocalFrontend } from "../utils/media";
import {
  downloadSubjectVideosToBrowser,
  pollSubjectSmoothPlayback,
  startSubjectSmoothPlayback,
} from "../utils/subjectDownload";

const SubjectDownloadButton = ({
  subject,
  videoCount = 0,
  variant = "grid",
  disabled = false,
}) => {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const pollRef = useRef(false);
  const isLocal = isLocalFrontend();
  const hasVideos = videoCount > 0;

  useEffect(() => {
    return () => {
      pollRef.current = false;
    };
  }, []);

  const handleLocalDownload = useCallback(async () => {
    if (!subject?._id || busy) return;
    setBusy(true);
    pollRef.current = true;
    try {
      await startSubjectSmoothPlayback(subject._id);
      toast.success(`Saving all ${videoCount} videos to your PC library…`);

      const finalStatus = await pollSubjectSmoothPlayback(subject._id, {
        onProgress: (status) => {
          if (!pollRef.current) return;
          setProgress(status);
        },
      });

      if (finalStatus.failed > 0) {
        toast.error(
          `Saved ${finalStatus.completed - finalStatus.skipped}/${finalStatus.total} videos. ${finalStatus.failed} failed.`
        );
      } else {
        toast.success(
          `${subject.name}: all videos ready for smooth playback on this PC. Study time still syncs to production.`
        );
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not download subject");
    } finally {
      pollRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  }, [subject, videoCount, busy]);

  const handleProductionDownload = useCallback(async () => {
    if (!subject?._id || busy) return;
    setBusy(true);
    try {
      toast.success(`Starting download of ${videoCount} videos…`);
      await downloadSubjectVideosToBrowser(subject._id, {
        onProgress: (info) => setProgress(info),
      });
      toast.success(`${subject.name}: downloads started in your browser.`);
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not download subject");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [subject, videoCount, busy]);

  const handleClick = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (isLocal) handleLocalDownload();
    else handleProductionDownload();
  };

  if (!hasVideos) return null;

  const label = isLocal ? "Download subject" : "Download";
  const title = isLocal
    ? "Save all videos to your PC library for smooth playback (study time syncs to production)"
    : "Download all videos to your device";

  const progressLabel = progress
    ? isLocal && progress.total
      ? `${progress.completed ?? 0}/${progress.total}${progress.currentTitle ? ` · ${progress.currentTitle}` : ""}`
      : progress.title
        ? `${progress.current ?? 0}/${progress.total ?? 0} · ${progress.title}`
        : null
    : null;

  if (variant === "list") {
    return (
      <button
        type="button"
        disabled={disabled || busy}
        title={title}
        className={`btn-ghost px-2 py-2 text-xs ${
          isLocal ? "text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/30" : ""
        }`}
        onClick={handleClick}
      >
        {busy ? (
          <FiLoader size={14} className="animate-spin" />
        ) : isLocal ? (
          <FiZap size={14} />
        ) : (
          <FiDownload size={14} />
        )}
        <span className="hidden sm:inline">{busy && progressLabel ? progressLabel : label}</span>
      </button>
    );
  }

  return (
    <div className="absolute bottom-2 right-2 z-20">
      <button
        type="button"
        disabled={disabled || busy}
        title={title}
        className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur transition hover:bg-black/50 disabled:opacity-70"
        onClick={handleClick}
      >
        {busy ? (
          <>
            <FiLoader size={11} className="animate-spin" />
            {progressLabel || "Working…"}
          </>
        ) : (
          <>
            {isLocal ? <FiZap size={11} /> : <FiDownload size={11} />}
            {label}
          </>
        )}
      </button>
    </div>
  );
};

export default SubjectDownloadButton;
