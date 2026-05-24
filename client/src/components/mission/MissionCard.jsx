const SLOT_META = {
  english: {
    label: "English",
    code: "ENG",
    accent: "from-sky-500 to-blue-600",
    border: "border-sky-500/40",
    bg: "bg-sky-500/10",
  },
  maths: {
    label: "Mathematics",
    code: "MTH",
    accent: "from-violet-500 to-purple-600",
    border: "border-violet-500/40",
    bg: "bg-violet-500/10",
  },
  gs: {
    label: "General Studies",
    code: "GS",
    accent: "from-amber-500 to-orange-600",
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
  },
  reading: {
    label: "Reading",
    code: "RDG",
    accent: "from-emerald-500 to-teal-600",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
  },
  mock_test: {
    label: "Sunday Mock",
    code: "MOCK",
    accent: "from-rose-500 to-red-600",
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
  },
};

const REASON_LABEL = {
  unwatched: "Priority: Unwatched",
  weak_subject: "Priority: Weak area",
  backlog: "Priority: Backlog",
  revision: "Revision drill",
  sunday_mock: "Weekly mock",
  default: "Daily target",
};

const MissionCard = ({ item, onComplete, onOpen, completing }) => {
  const meta = SLOT_META[item.slot] || SLOT_META.reading;
  const isReading = item.slot === "reading";
  const isMock = item.slot === "mock_test";

  const href = isReading
    ? null
    : isMock && item.paperId
      ? `/paper/${item.paperId}`
      : item.contentId
        ? `/video/${item.contentId}`
        : null;

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border ${meta.border} bg-white p-4 shadow-md transition-all hover:shadow-lg dark:bg-[#141414] dark:shadow-black/30 ${
        item.completed ? "opacity-75" : ""
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-linear-to-r ${meta.accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white bg-linear-to-r ${meta.accent}`}
            >
              {meta.code}
            </span>
            {item.completed && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Complete
              </span>
            )}
          </div>
          <h3 className="mt-2 font-display text-base font-semibold text-slate-900 dark:text-slate-50">
            {item.title || meta.label}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {[item.subjectName, item.chapterName].filter(Boolean).join(" · ")}
            {isReading && item.targetMinutes ? ` · ${item.targetMinutes} min target` : ""}
          </p>
          <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {REASON_LABEL[item.reason] || REASON_LABEL.default}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {href && (
          <button
            type="button"
            className="btn-primary text-xs!"
            onClick={() => onOpen?.(href, item)}
          >
            Launch
          </button>
        )}
        {!item.completed && (
          <button
            type="button"
            className="btn-secondary text-xs!"
            disabled={completing}
            onClick={() => onComplete?.(item)}
          >
            {completing ? "Saving…" : "Mark complete"}
          </button>
        )}
      </div>
    </article>
  );
};

export default MissionCard;
export { SLOT_META };
