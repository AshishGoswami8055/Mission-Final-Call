import { FiCheck, FiLoader, FiTrash2, FiUploadCloud } from "react-icons/fi";
import { formatBytes } from "../utils/uploadProgress";

const PHASE_META = {
  cleaning: { label: "Cleaning old import", icon: FiTrash2 },
  deleting: { label: "Removing course data", icon: FiTrash2 },
  importing: { label: "Importing from Telegram", icon: FiUploadCloud },
  "telegram-download": { label: "Downloading PDF from Telegram", icon: FiLoader },
  uploading: { label: "Uploading PDF to Cloudinary", icon: FiUploadCloud },
  syncing: { label: "Syncing new uploads", icon: FiLoader },
  finalizing: { label: "Finalizing import", icon: FiLoader },
  done: { label: "Complete", icon: FiCheck },
  error: { label: "Failed", icon: FiTrash2 },
};

const OperationProgressOverlay = ({ progress, onDismiss }) => {
  if (!progress?.active) return null;

  const meta = PHASE_META[progress.phase] || PHASE_META.importing;
  const Icon = meta.icon;
  const isDone = progress.phase === "done";
  const isError = progress.phase === "error";
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0)));
  const showSpinner =
    !isDone &&
    !isError &&
    (progress.phase === "importing" ||
      progress.phase === "syncing" ||
      progress.phase === "telegram-download" ||
      progress.phase === "uploading" ||
      progress.phase === "finalizing");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#1a1a1a]"
        role="status"
        aria-live="polite"
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isError
                ? "bg-rose-100 text-rose-600 dark:bg-rose-950/40"
                : isDone
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40"
                  : "bg-teal-100 text-teal-700 dark:bg-teal-950/40"
            }`}
          >
            {isDone ? (
              <FiCheck size={18} />
            ) : showSpinner ? (
              <FiLoader size={18} className="animate-spin" />
            ) : (
              <Icon size={18} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {progress.message || meta.label}
            </p>
            {(progress.currentLabel || progress.currentFile) && (
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {progress.currentLabel || progress.currentFile}
              </p>
            )}
            {progress.total > 0 && !isError && (
              <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {progress.current ?? 0} / {progress.total}
                {progress.detail ? ` · ${progress.detail}` : ""}
              </p>
            )}
            {progress.bytesTotal > 0 && !isError && (
              <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                {formatBytes(progress.bytesLoaded)} / {formatBytes(progress.bytesTotal)}
              </p>
            )}
          </div>
          <p
            className={`font-display text-2xl font-bold tabular-nums leading-none ${
              isError
                ? "text-rose-600"
                : isDone
                  ? "text-emerald-600"
                  : "text-teal-700 dark:text-teal-400"
            }`}
          >
            {isError ? "—" : `${percent}%`}
          </p>
        </div>

        <div className="progress-bar h-2.5">
          <div
            className={`progress-bar-fill h-full transition-all duration-300 ease-out ${
              isError ? "bg-rose-500" : isDone ? "progress-bar-fill-done" : "progress-bar-fill-default"
            }`}
            style={{ width: `${Math.max(isError ? 100 : 2, percent)}%` }}
          />
        </div>

        {(isDone || isError) && onDismiss && (
          <button type="button" className="btn-primary mt-4 w-full text-sm" onClick={onDismiss}>
            {isError ? "Close" : "Done"}
          </button>
        )}
      </div>
    </div>
  );
};

export default OperationProgressOverlay;
