import { FiBookOpen, FiCheck, FiTrash2 } from "react-icons/fi";
import { getSubjectTheme } from "../utils/subjectThemes";

const SubjectGridCard = ({
  subject,
  stats,
  index,
  onClick,
  onDelete,
  updateInfo,
  compact = false,
}) => {
  const theme = getSubjectTheme(subject.name, index);
  const videoCount = stats?.videos ?? 0;
  const pdfCount = stats?.pdfs ?? 0;
  const completed = stats?.completed ?? 0;
  const total = videoCount + pdfCount;
  const completionPct = total ? Math.round((completed / total) * 100) : 0;
  const isTelegramSubject = subject.telegramTopicId != null;
  const canUpdate = isTelegramSubject && onUpdateSubject;
  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const newCount = updateInfo?.newCount ?? 0;
  const checked = updateInfo !== undefined;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onClick?.(subject)}
        className={`relative flex w-full overflow-hidden rounded-2xl bg-linear-to-br ${theme.gradient} text-left shadow-md transition duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
          compact ? "min-h-[100px] p-4" : "min-h-[120px] p-5 sm:min-h-[140px]"
        }`}
      >
        {canUpdate && (
          <span className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
            {hasUpdate ? (
              <>
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.9)] ring-2 ring-white/40" />
                <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 shadow-sm">
                  {newCount} new
                </span>
              </>
            ) : checked ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur"
                title="Up to date"
              >
                <FiCheck size={10} /> Up to date
              </span>
            ) : null}
          </span>
        )}
        <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <p className="line-clamp-2 pr-16 text-base font-bold leading-snug text-white sm:text-lg">
              {subject.name}
            </p>
            <p className="mt-1 text-xs font-medium text-white/80">
              {total ? `${total} lessons` : "No content yet"}
              {completed > 0 ? ` · ${completed} done` : ""}
              {total > 0 ? ` · ${completionPct}%` : ""}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {videoCount > 0 && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                {videoCount} videos
              </span>
            )}
            {pdfCount > 0 && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                {pdfCount} PDFs
              </span>
            )}
          </div>
          {total > 0 && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
              <div
                className={`h-full rounded-full ${completionPct === 100 ? "bg-emerald-300" : "bg-white/70"}`}
                style={{ width: `${completionPct}%` }}
              />
            </div>
          )}
        </div>
        <span className="pointer-events-none absolute -right-2 -bottom-2 text-6xl opacity-30 transition group-hover:scale-110 group-hover:opacity-40 sm:text-7xl">
          {theme.icon}
        </span>
        {!total && !canUpdate && (
          <span className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 text-white/90 backdrop-blur">
            <FiBookOpen size={14} />
          </span>
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${subject.name}`}
          className={`absolute top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur transition hover:bg-rose-600 group-hover:opacity-100 ${canUpdate ? "right-2" : "right-2"}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(subject);
          }}
        >
          <FiTrash2 size={13} />
        </button>
      )}
    </div>
  );
};

export default SubjectGridCard;
