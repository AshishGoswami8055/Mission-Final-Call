import { FiBookOpen, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { getSubjectTheme } from "../utils/subjectThemes";

const SubjectGridCard = ({
  subject,
  stats,
  index,
  onClick,
  onDelete,
  updateInfo,
  onUpdateSubject,
  updating = false,
}) => {
  const theme = getSubjectTheme(subject.name, index);
  const videoCount = stats?.videos ?? 0;
  const pdfCount = stats?.pdfs ?? 0;
  const completed = stats?.completed ?? 0;
  const total = videoCount + pdfCount;
  const hasUpdate = updateInfo?.hasUpdate;
  const newCount = updateInfo?.newCount ?? 0;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onClick?.(subject)}
        className={`relative flex min-h-[120px] w-full overflow-hidden rounded-2xl bg-linear-to-br ${theme.gradient} p-5 text-left shadow-md transition duration-300 hover:-translate-y-0.5 hover:shadow-xl sm:min-h-[140px]`}
      >
        {hasUpdate && (
          <span
            className="absolute right-3 top-3 z-10 flex items-center gap-1.5"
            title={`${newCount} new lesson${newCount === 1 ? "" : "s"} available`}
          >
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.9)] ring-2 ring-white/40" />
            <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 shadow-sm">
              {newCount} new
            </span>
          </span>
        )}
        <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <p className="line-clamp-2 pr-16 text-lg font-bold leading-snug text-white sm:text-xl">
              {subject.name}
            </p>
            <p className="mt-1 text-xs font-medium text-white/80">
              {total ? `${total} lessons` : "No content yet"}
              {completed > 0 ? ` · ${completed} done` : ""}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
            {hasUpdate && onUpdateSubject && (
              <button
                type="button"
                disabled={updating}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-900 shadow-sm transition hover:bg-amber-50 disabled:opacity-60"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateSubject(subject);
                }}
              >
                <FiRefreshCw size={11} className={updating ? "animate-spin" : ""} />
                Download
              </button>
            )}
          </div>
        </div>
        <span className="pointer-events-none absolute -right-2 -bottom-2 text-6xl opacity-30 transition group-hover:scale-110 group-hover:opacity-40 sm:text-7xl">
          {theme.icon}
        </span>
        {!total && !hasUpdate && (
          <span className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 text-white/90 backdrop-blur">
            <FiBookOpen size={14} />
          </span>
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${subject.name}`}
          className={`absolute top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur transition hover:bg-rose-600 group-hover:opacity-100 ${hasUpdate ? "right-24" : "right-2"}`}
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
