import {
  FiBook,
  FiCheckCircle,
  FiCircle,
  FiEdit2,
  FiExternalLink,
  FiFileText,
  FiGlobe,
  FiTrash2,
} from "react-icons/fi";
import { toAbsoluteMediaUrl } from "../utils/media";

const getPaperKind = (title) => {
  const t = (title || "").toUpperCase();
  if (/ENGLISH/.test(t)) return "english";
  if (/GK|GS|GENERAL\s*(STUDIES|KNOWLEDGE)/.test(t)) return "gs";
  return "default";
};

const KIND = {
  english: {
    label: "English",
    short: "ENG",
    Icon: FiBook,
    strip: "border-l-slate-900 dark:border-l-slate-100",
    pill: "border border-slate-200/90 bg-slate-50 text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100",
  },
  gs: {
    label: "GK / GS",
    short: "GK",
    Icon: FiGlobe,
    strip: "border-l-amber-500 dark:border-l-amber-400",
    pill: "border border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-700/40 dark:bg-amber-950/35 dark:text-amber-100",
  },
  default: {
    label: "Paper",
    short: "—",
    Icon: FiFileText,
    strip: "border-l-slate-300 dark:border-l-slate-600",
    pill: "border border-slate-200/90 bg-white text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300",
  },
};

/**
 * PYQ card — two-column grid layout: wide tile, extra vertical space,
 * stacked actions. English vs GK: left rail + pill (KIND).
 */
const PaperCard = ({ paper, onToggleAttempted, onEdit, onDelete }) => {
  const kind = getPaperKind(paper.title);
  const meta = KIND[kind] || KIND.default;
  const KindIcon = meta.Icon;

  const pdfUrl =
    paper.sourceType === "upload"
      ? toAbsoluteMediaUrl(paper.filePath)
      : paper.sourceType === "cloudinary"
        ? paper.pdfUrl || ""
        : paper.url || "";

  return (
    <article
      className={`group flex min-h-62 w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 border-l-4 bg-white transition-colors duration-150 hover:border-slate-300 sm:min-h-68 dark:border-white/10 dark:bg-[#1a1a1a] dark:hover:border-white/20 ${meta.strip}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${meta.pill}`}
            title={meta.label}
          >
            <KindIcon size={12} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
            {meta.short}
          </span>
          <span className="font-display text-2xl font-semibold tabular-nums leading-none text-slate-900 dark:text-slate-50 sm:text-3xl">
            {paper.year}
          </span>
          <span className="hidden text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:inline dark:text-slate-500">
            PYQ
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {paper.attempted ? (
            <span className="mr-1 inline-flex items-center gap-1 rounded-full border border-emerald-200/90 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold uppercase text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
              <FiCheckCircle size={10} strokeWidth={2.5} />
              Done
            </span>
          ) : null}
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
            onClick={() => onEdit(paper)}
            aria-label="Edit paper"
          >
            <FiEdit2 size={15} />
          </button>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
            onClick={() => onDelete(paper._id)}
            aria-label="Delete paper"
          >
            <FiTrash2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <div className="min-h-17 flex-1">
          <h3 className="line-clamp-3 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50 sm:text-base">
            {paper.title}
          </h3>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {paper.examType || "CDS"}
            {paper.durationMinutes ? ` · ${paper.durationMinutes} min` : ""}
            {paper.totalQuestions ? ` · ${paper.totalQuestions} Q` : ""}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open PDF in new tab"
            className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3! text-sm"
          >
            <FiExternalLink size={16} strokeWidth={2} />
            View PDF
          </a>
          <button
            type="button"
            className={
              paper.attempted
                ? "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:text-emerald-200"
                : "btn-secondary inline-flex w-full items-center justify-center gap-2 py-3! text-sm"
            }
            onClick={() => onToggleAttempted(paper._id)}
          >
            {paper.attempted ? <FiCheckCircle size={16} /> : <FiCircle size={16} />}
            {paper.attempted ? "Attempted" : "Mark attempted"}
          </button>
        </div>
      </div>
    </article>
  );
};

export default PaperCard;
