import { FiBookOpen, FiCheck, FiClock, FiPlay } from "react-icons/fi";

const SLOT_STYLE = {
  english: { label: "English", dot: "bg-sky-500", badge: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200" },
  maths: { label: "Maths", dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200" },
  gs: { label: "GS", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  reading: { label: "Reading", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" },
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const firstName = (name = "") => {
  const part = String(name).trim().split(/\s+/)[0];
  return part || "Cadet";
};

const MissionTargetRow = ({ target, index, onLaunch, onComplete, onReadingFocus, completing }) => {
  const style = SLOT_STYLE[target.slot] || SLOT_STYLE.reading;
  const href =
    target.slot === "reading" ? null : target.contentId ? `/video/${target.contentId}` : null;

  return (
    <li
      className={`flex flex-col gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-white/10 ${
        target.completed ? "opacity-75" : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs tabular-nums text-slate-400">#{index + 1}</span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
              {style.label}
            </span>
            {target.completed && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                <FiCheck size={10} /> Done
              </span>
            )}
          </div>
          <h3 className="mt-1 font-medium text-slate-900 dark:text-slate-50">
            {target.slot === "reading" ? "Reading session" : target.title || `${style.label} video`}
          </h3>
          {target.subjectName && target.slot !== "reading" && (
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {[target.subjectName, target.chapterName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-5 sm:pl-0">
        <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-slate-500">
          <FiClock size={12} />
          {target.minutesLabel}
        </span>
        {href && (
          <button type="button" className="btn-primary text-xs!" onClick={() => onLaunch?.(href, target)}>
            <FiPlay size={13} /> Watch
          </button>
        )}
        {target.slot === "reading" && !target.completed && (
          <button type="button" className="btn-primary text-xs!" onClick={() => onReadingFocus?.()}>
            <FiBookOpen size={13} /> Timer
          </button>
        )}
        {!target.completed && target.slot !== "reading" && (
          <button type="button" className="btn-secondary text-xs!" disabled={completing} onClick={() => onComplete?.(target)}>
            {completing ? "Saving…" : "Done"}
          </button>
        )}
      </div>
    </li>
  );
};

const TodaysTargetBoard = ({
  userName = "Cadet",
  dailyTarget,
  onLaunch,
  onComplete,
  onReadingFocus,
  completingSlot,
  headerActions,
}) => {
  const targets = dailyTarget?.targets || [];
  const progress = dailyTarget?.progressPercent ?? 0;
  const totalLabel = dailyTarget?.totalGoalLabel || "—";
  const completedMin = dailyTarget?.completedMinutes ?? 0;
  const totalMin = dailyTarget?.totalGoalMinutes ?? 0;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {getGreeting()}, <span className="font-medium text-slate-700 dark:text-slate-300">{firstName(userName)}</span>
            </p>
            <h2 className="font-display mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-50">Today&apos;s target</h2>
          </div>
          {headerActions}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {completedMin} / {totalMin} min · {totalLabel}
            </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-700 dark:bg-slate-100"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>
      </div>

      {targets.length ? (
        <ul>
          {targets.map((target, index) => (
            <MissionTargetRow
              key={target.slot}
              target={target}
              index={index}
              onLaunch={onLaunch}
              onComplete={onComplete}
              onReadingFocus={onReadingFocus}
              completing={completingSlot === target.slot}
            />
          ))}
        </ul>
      ) : (
        <div className="mx-5 my-6 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/10">
          Add English, Maths, and GS subjects with videos, then refresh the plan.
        </div>
      )}
    </section>
  );
};

export default TodaysTargetBoard;
export { getGreeting, firstName };
