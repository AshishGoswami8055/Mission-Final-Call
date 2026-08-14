import { useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiFolder, FiHardDrive, FiLoader, FiRefreshCw, FiZap } from "react-icons/fi";
import { Link } from "react-router-dom";
import { formatFileSize } from "../utils/media";
import { revealFullCourseVideo } from "../utils/subjectFullCourse";

const FullCoursePlaybackPanel = ({ subjectId, status, isDark = false, onRefresh }) => {
  const [revealing, setRevealing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const ready = Boolean(status?.ready);
  const shell = isDark
    ? "border-neutral-800 bg-neutral-950/80"
    : "border-slate-200/90 bg-slate-50/80";

  const handleReveal = async () => {
    if (!subjectId || revealing) return;
    setRevealing(true);
    try {
      const { data } = await revealFullCourseVideo(subjectId);
      toast.success(data.message || "Opened in File Explorer");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not open folder");
    } finally {
      setRevealing(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-2 md:space-y-3">
      <div
        className={`rounded-xl border px-3 py-3 sm:px-4 ${
          isDark ? "border-neutral-800 bg-neutral-950/60" : "border-slate-200/90 bg-white/80"
        }`}
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Storage on your PC
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <FiHardDrive size={15} className="shrink-0 text-sky-600 dark:text-sky-400" />
              {ready ? "Linked full course file" : "No file linked"}
            </p>
            {ready ? (
              <>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {status.originalFileName || "Full course MP4"}
                  {status.sizeBytes ? ` · ${formatFileSize(status.sizeBytes)}` : ""}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <FiCheck size={11} />
                  Original quality · no re-encoding
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Choose your MP4 from the subject page to enable cinema mode.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            >
              {refreshing ? <FiLoader size={13} className="animate-spin" /> : <FiRefreshCw size={13} />}
              Refresh
            </button>
            {ready ? (
              <button
                type="button"
                className="btn-secondary text-xs"
                disabled={revealing}
                onClick={() => void handleReveal()}
              >
                {revealing ? <FiLoader size={13} className="animate-spin" /> : <FiFolder size={13} />}
                Open folder
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={`rounded-xl border px-3 py-3 sm:px-4 ${shell}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <FiZap size={13} />
              Cinema playback
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {ready
                ? "Streaming your linked file with byte-range requests — resume position saves automatically."
                : "Link a full-course MP4 to watch the entire subject in one sitting."}
            </p>
            <p className="mt-1 hidden text-xs text-slate-500 md:block">
              Study time syncs to your dashboard and streak.{" "}
              <Link
                to="/settings/pc-media"
                className="text-sky-600 hover:underline dark:text-sky-400"
              >
                PC media settings
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FullCoursePlaybackPanel;
