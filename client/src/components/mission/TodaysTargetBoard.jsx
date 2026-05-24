import { FiBookOpen, FiCheck, FiClock, FiPlay } from "react-icons/fi";

const shell =
  "rounded-2xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-[#1a1a1a]";

const SLOT_STYLE = {
  english: {
    emoji: "📘",
    label: "English",
    strip: "border-l-sky-500",
    badge: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
    gradient: "from-sky-500 to-blue-600",
  },
  maths: {
    emoji: "📐",
    label: "Mathematics",
    strip: "border-l-indigo-500",
    badge: "bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200",
    gradient: "from-indigo-500 to-violet-600",
  },
  gs: {
    emoji: "🌍",
    label: "General Studies",
    strip: "border-l-amber-500",
    badge: "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    gradient: "from-amber-500 to-orange-600",
  },
  reading: {
    emoji: "📖",
    label: "Reading",
    strip: "border-l-emerald-500",
    badge: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    gradient: "from-emerald-500 to-teal-600",
  },
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

const MissionTargetCard = ({ target, index, onLaunch, onComplete, onReadingFocus, completing }) => {
  const style = SLOT_STYLE[target.slot] || SLOT_STYLE.reading;
  const href =
    target.slot === "reading" ? null : target.contentId ? `/video/${target.contentId}` : null;

  return (
    <article
      className={`${shell} border-l-4 ${style.strip} overflow-hidden transition-shadow hover:shadow-md ${
        target.completed ? "opacity-80" : ""
      }`}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${style.gradient} text-lg text-white shadow-sm`}
            aria-hidden
          >
            {style.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold tabular-nums text-slate-400">#{index + 1}</span>
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
                {style.label}
              </span>
              {target.completed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                  <FiCheck size={10} /> Done
                </span>
              )}
            </div>
            <h3 className="mt-1.5 font-semibold text-slate-900 dark:text-slate-50">
              {target.slot === "reading" ? "Reading session" : target.title || `${style.label} video`}
            </h3>
            {target.subjectName && target.slot !== "reading" && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {[target.subjectName, target.chapterName].filter(Boolean).join(" · ")}
              </p>
            )}
            {target.slot === "reading" && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Newspaper, notes, or current affairs
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-slate-50 px-3 py-1.5 text-sm font-semibold tabular-nums text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
            <FiClock size={14} className="text-slate-400" />
            {target.minutesLabel}
          </span>
          <div className="flex flex-wrap gap-2">
            {href && (
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5 text-xs!"
                onClick={() => onLaunch?.(href, target)}
              >
                <FiPlay size={14} /> Watch
              </button>
            )}
            {target.slot === "reading" && !target.completed && (
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5 text-xs!"
                onClick={() => onReadingFocus?.()}
              >
                <FiBookOpen size={14} /> Start timer
              </button>
            )}
            {!target.completed && target.slot !== "reading" && (
              <button
                type="button"
                className="btn-secondary text-xs!"
                disabled={completing}
                onClick={() => onComplete?.(target)}
              >
                {completing ? "Saving…" : "Mark done"}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

const TodaysTargetBoard = ({
  userName = "Cadet",
  dailyTarget,
  onLaunch,
  onComplete,
  onReadingFocus,
  completingSlot,
}) => {
  const targets = dailyTarget?.targets || [];
  const progress = dailyTarget?.progressPercent ?? 0;
  const totalLabel = dailyTarget?.totalGoalLabel || "—";
  const completedMin = dailyTarget?.completedMinutes ?? 0;
  const totalMin = dailyTarget?.totalGoalMinutes ?? 0;

  return (
    <section className={shell}>
      <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10 sm:px-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {getGreeting()}, <span className="font-semibold text-slate-800 dark:text-slate-200">{firstName(userName)}</span>
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
          Today&apos;s target
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          3 subject videos + 1 hour reading · {totalLabel} total goal
        </p>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {targets.length ? (
          targets.map((target, index) => (
            <MissionTargetCard
              key={target.slot}
              target={target}
              index={index}
              onLaunch={onLaunch}
              onComplete={onComplete}
              onReadingFocus={onReadingFocus}
              completing={completingSlot === target.slot}
            />
          ))
        ) : (
          <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-white/10">
            Add English, Maths, and GS subjects with videos, then tap Refresh plan.
          </div>
        )}

        <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total study goal</p>
              <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {totalLabel}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {completedMin} / {totalMin} min completed today
              </p>
            </div>
            <p className="font-display text-3xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
              {progress}%
            </p>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-linear-to-r from-indigo-500 via-sky-500 to-emerald-500 transition-all duration-700"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default TodaysTargetBoard;
export { getGreeting, firstName };
