import { FiCheck, FiChevronRight, FiRefreshCw } from "react-icons/fi";
import { getSubjectTheme } from "../utils/subjectThemes";

const SubjectListRow = ({
  subject,
  stats,
  index,
  updateInfo,
  onClick,
  onUpdateSubject,
  updating = false,
}) => {
  const theme = getSubjectTheme(subject.name, index);
  const videoCount = stats?.videos ?? 0;
  const pdfCount = stats?.pdfs ?? 0;
  const completed = stats?.completed ?? 0;
  const total = videoCount + pdfCount;
  const completionPct = total ? Math.round((completed / total) * 100) : 0;
  const isTelegramSubject = subject.telegramTopicId != null;
  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const newCount = updateInfo?.newCount ?? 0;

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 transition hover:border-teal-300 hover:bg-teal-50/40 dark:border-white/10 dark:bg-[#1a1a1a] dark:hover:border-teal-700 dark:hover:bg-teal-950/20 sm:px-4 sm:py-3">
      <button
        type="button"
        onClick={() => onClick?.(subject)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${theme.gradient} text-lg shadow-sm`}
        >
          {theme.icon}
        </span>
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
      {isTelegramSubject && onUpdateSubject && (
        <button
          type="button"
          disabled={updating}
          className={`btn-ghost shrink-0 px-2 py-2 text-xs sm:px-3 ${
            hasUpdate ? "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30" : ""
          }`}
          title="Update this subject from Telegram"
          onClick={() => onUpdateSubject(subject)}
        >
          <FiRefreshCw size={14} className={updating ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{hasUpdate ? `Update (${newCount})` : "Update"}</span>
        </button>
      )}
    </div>
  );
};

export default SubjectListRow;
