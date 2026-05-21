import { FiBookOpen, FiTrash2 } from "react-icons/fi";
import { getSubjectTheme } from "../utils/subjectThemes";

const SubjectGridCard = ({ subject, stats, index, onClick, onDelete }) => {
  const theme = getSubjectTheme(subject.name, index);
  const videoCount = stats?.videos ?? 0;
  const pdfCount = stats?.pdfs ?? 0;
  const completed = stats?.completed ?? 0;
  const total = videoCount + pdfCount;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onClick?.(subject)}
        className={`relative flex min-h-[120px] w-full overflow-hidden rounded-2xl bg-linear-to-br ${theme.gradient} p-5 text-left shadow-md transition duration-300 hover:-translate-y-0.5 hover:shadow-xl sm:min-h-[140px]`}
      >
        <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <p className="line-clamp-2 text-lg font-bold leading-snug text-white sm:text-xl">{subject.name}</p>
            <p className="mt-1 text-xs font-medium text-white/80">
              {total ? `${total} lessons` : "No content yet"}
              {completed > 0 ? ` · ${completed} done` : ""}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
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
        </div>
        <span className="pointer-events-none absolute -right-2 -bottom-2 text-6xl opacity-30 transition group-hover:scale-110 group-hover:opacity-40 sm:text-7xl">
          {theme.icon}
        </span>
        {!total && (
          <span className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 text-white/90 backdrop-blur">
            <FiBookOpen size={14} />
          </span>
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${subject.name}`}
          className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur transition hover:bg-rose-600 group-hover:opacity-100"
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
