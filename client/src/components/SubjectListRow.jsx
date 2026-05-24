import { useState } from "react";
import { FiCheck, FiChevronRight, FiEdit2, FiLoader, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { getSubjectTheme } from "../utils/subjectThemes";

const SubjectListRow = ({
  subject,
  stats,
  index,
  updateInfo,
  onClick,
  onUpdateSubject,
  onRenameSubject,
  onDeleteSubject,
  updating = false,
  renaming = false,
  deleting = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const theme = getSubjectTheme(subject.name, index);
  const videoCount = stats?.videos ?? 0;
  const pdfCount = stats?.pdfs ?? 0;
  const completed = stats?.completed ?? 0;
  const total = videoCount + pdfCount;
  const completionPct = total ? Math.round((completed / total) * 100) : 0;
  const isTelegramSubject = subject.telegramTopicId != null;
  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const newCount = updateInfo?.newCount ?? 0;
  const busy = updating || renaming || deleting;

  const startRename = (event) => {
    event.stopPropagation();
    setEditing(true);
    setRenameValue(subject.name || "");
  };

  const cancelRename = () => {
    setEditing(false);
    setRenameValue("");
  };

  const saveRename = async () => {
    const nextName = renameValue.trim();
    if (!nextName) return;
    if (nextName === subject.name) {
      cancelRename();
      return;
    }
    if (!onRenameSubject) return;
    try {
      await onRenameSubject(subject, nextName);
      setEditing(false);
      setRenameValue("");
    } catch {
      /* parent shows toast */
    }
  };

  const iconEl = (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${theme.gradient} text-lg shadow-sm`}
    >
      {theme.icon}
    </span>
  );

  if (editing) {
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border border-teal-300 bg-teal-50/40 px-3 py-2.5 dark:border-teal-700 dark:bg-teal-950/20 sm:px-4 sm:py-3 ${
          renaming ? "opacity-80" : ""
        }`}
      >
        {iconEl}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input
            className="input min-w-0 flex-1 py-1.5 text-sm"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            autoFocus
            disabled={renaming}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveRename();
              }
              if (event.key === "Escape") cancelRename();
            }}
          />
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={renaming || !renameValue.trim()}
            onClick={saveRename}
          >
            {renaming ? <FiLoader size={12} className="animate-spin" /> : "Save"}
          </button>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            disabled={renaming}
            onClick={cancelRename}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 transition hover:border-teal-300 hover:bg-teal-50/40 dark:border-white/10 dark:bg-[#1a1a1a] dark:hover:border-teal-700 dark:hover:bg-teal-950/20 sm:px-4 sm:py-3 ${
        busy ? "opacity-80" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onClick?.(subject)}
        disabled={busy}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        {iconEl}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-slate-900 dark:text-slate-50">{subject.name}</span>
            {hasUpdate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                {newCount} new
              </span>
            )}
            {isTelegramSubject && updateInfo && !hasUpdate && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <FiCheck size={10} /> Up to date
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>{total ? `${total} lessons` : "No content"}</span>
            {videoCount > 0 && <span>{videoCount} videos</span>}
            {pdfCount > 0 && <span>{pdfCount} PDFs</span>}
            {total > 0 && (
              <span className={completionPct === 100 ? "font-medium text-emerald-600 dark:text-emerald-400" : ""}>
                {completionPct}% complete
              </span>
            )}
          </span>
          {total > 0 && (
            <span className="mt-2 block h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <span
                className={`block h-full rounded-full transition-all ${
                  completionPct === 100 ? "bg-emerald-500" : "bg-teal-500"
                }`}
                style={{ width: `${completionPct}%` }}
              />
            </span>
          )}
        </span>
        <FiChevronRight className="shrink-0 text-slate-300 group-hover:text-teal-500 dark:text-slate-600" size={18} />
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {onRenameSubject && (
          <button
            type="button"
            disabled={busy}
            className="btn-ghost px-2 py-2 text-xs text-slate-500"
            title="Rename subject"
            onClick={startRename}
          >
            {renaming ? (
              <FiLoader size={14} className="animate-spin" />
            ) : (
              <FiEdit2 size={14} />
            )}
          </button>
        )}
        {onDeleteSubject && (
          <button
            type="button"
            disabled={busy}
            className="btn-ghost px-2 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            title="Delete subject"
            onClick={() => onDeleteSubject(subject)}
          >
            {deleting ? (
              <FiLoader size={14} className="animate-spin" />
            ) : (
              <FiTrash2 size={14} />
            )}
          </button>
        )}
        {isTelegramSubject && onUpdateSubject && (
          <button
            type="button"
            disabled={busy}
            className={`btn-ghost px-2 py-2 text-xs sm:px-3 ${
              hasUpdate ? "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30" : ""
            }`}
            title="Update this subject from Telegram"
            onClick={() => onUpdateSubject(subject)}
          >
            {updating ? (
              <FiRefreshCw size={14} className="animate-spin" />
            ) : (
              <FiRefreshCw size={14} />
            )}
            <span className="hidden sm:inline">{hasUpdate ? `Update (${newCount})` : "Update"}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default SubjectListRow;
