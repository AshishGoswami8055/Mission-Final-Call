import { FiBookOpen, FiCheck, FiGlobe, FiPlay } from "react-icons/fi";

const SLOT_ICON = {
  english: FiBookOpen,
  maths: FiPlay,
  gs: FiGlobe,
  reading: FiBookOpen,
};

const SLOT_EMOJI = {
  english: "📘",
  maths: "📐",
  gs: "🌍",
  reading: "📖",
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "GOOD MORNING";
  if (h < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
};

const firstName = (name = "") => {
  const part = String(name).trim().split(/\s+/)[0];
  return part ? part.toUpperCase() : "CADET";
};

const ProgressBlocks = ({ percent }) => {
  const filled = Math.round((Math.min(100, percent) / 100) * 10);
  const blocks = Array.from({ length: 10 }, (_, i) => (i < filled ? "█" : "░"));
  return (
    <div className="space-y-2">
      <div
        className="font-mono text-lg tracking-wider text-emerald-400 sm:text-xl"
        aria-hidden
      >
        [{blocks.join("")}]
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-linear-to-r from-emerald-500 to-sky-400 transition-all duration-700"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
};

const TargetRow = ({ target, index, onLaunch, onComplete, onReadingFocus, completing }) => {
  const Icon = SLOT_ICON[target.slot] || FiPlay;
  const emoji = SLOT_EMOJI[target.slot] || "•";
  const href =
    target.slot === "reading"
      ? null
      : target.contentId
        ? `/video/${target.contentId}`
        : null;

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3.5 transition sm:flex-row sm:items-center sm:justify-between ${
        target.completed
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-white/10 bg-white/[0.03] hover:border-white/20"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-slate-300">
          {index + 1}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg" aria-hidden>
              {emoji}
            </span>
            <p className="font-semibold text-white">
              {target.label}
              <span className="ml-2 font-normal text-slate-400">({target.minutesLabel})</span>
            </p>
            {target.completed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                <FiCheck size={10} /> Done
              </span>
            )}
          </div>
          {target.title && target.slot !== "reading" && (
            <p className="mt-1 truncate text-sm text-slate-400">{target.title}</p>
          )}
          {target.subjectName && target.slot !== "reading" && (
            <p className="mt-0.5 text-xs text-slate-500">
              {[target.subjectName, target.chapterName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-10 sm:pl-0">
        {target.slot === "reading" && !target.completed && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            onClick={() => onReadingFocus?.()}
          >
            <FiBookOpen size={14} /> Start timer
          </button>
        )}
        {href && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-400"
            onClick={() => onLaunch?.(href, target)}
          >
            <Icon size={14} /> Watch
          </button>
        )}
        {!target.completed && target.slot !== "reading" && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
            disabled={completing}
            onClick={() => onComplete?.(target)}
          >
            {completing ? "…" : "Mark done"}
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
}) => {
  const targets = dailyTarget?.targets || [];
  const progress = dailyTarget?.progressPercent ?? 0;
  const totalLabel = dailyTarget?.totalGoalLabel || "—";
  const completedMin = dailyTarget?.completedMinutes ?? 0;
  const totalMin = dailyTarget?.totalGoalMinutes ?? 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/80 bg-linear-to-br from-[#0a0f1a] via-[#0d1526] to-[#111827] p-6 text-white shadow-2xl sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-sky-400/90">
        {getGreeting()} {firstName(userName)}
      </p>

      <h2 className="font-display mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
        TODAY&apos;S TARGET
      </h2>
      <div className="mt-3 h-px w-full max-w-md bg-linear-to-r from-sky-500/60 via-slate-500/40 to-transparent" />

      <ul className="mt-6 space-y-3">
        {targets.length ? (
          targets.map((target, index) => (
            <TargetRow
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
          <li className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-400">
            No videos found yet. Add English, Maths, and GS subjects with video content, then
            regenerate today&apos;s mission.
          </li>
        )}
      </ul>

      <div className="mt-8 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-4">
        <p className="text-sm font-semibold text-amber-100">
          🎯 Total Study Time Goal:{" "}
          <span className="font-display text-lg text-amber-300">{totalLabel}</span>
        </p>
        <p className="mt-1 text-xs text-amber-200/60">
          3 videos + 1 hour reading · {completedMin} / {totalMin} min logged toward today&apos;s
          goal
        </p>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-300">Progress</span>
          <span className="font-display text-xl font-bold tabular-nums text-emerald-400">
            {progress}%
          </span>
        </div>
        <ProgressBlocks percent={progress} />
      </div>
    </section>
  );
};

export default TodaysTargetBoard;
export { getGreeting, firstName };
