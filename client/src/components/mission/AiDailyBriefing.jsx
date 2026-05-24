import { FiCpu, FiRefreshCw, FiTrendingDown, FiTrendingUp, FiZap } from "react-icons/fi";

const shell =
  "rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-[#1a1a1a]";

const AiDailyBriefing = ({ briefing, onRefresh, refreshing = false }) => {
  if (!briefing) return null;

  const isAi = briefing.source === "ai";

  return (
    <section className={`${shell} relative overflow-hidden`}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/5 blur-3xl dark:bg-indigo-400/10" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-md">
            <FiCpu size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
                AI study coach
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isAi
                    ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                    : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                }`}
              >
                {isAi ? "GPT powered" : "Smart plan"}
              </span>
            </div>
            <h2 className="font-display mt-1 text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
              {briefing.headline}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {briefing.summary}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn-secondary inline-flex shrink-0 items-center gap-2 self-start text-xs!"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <FiRefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh AI plan
        </button>
      </div>

      {(briefing.focusAreas?.length > 0 || briefing.strengths?.length > 0) && (
        <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
          {briefing.focusAreas?.length > 0 && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                <FiTrendingDown size={14} /> Focus today
              </p>
              <p className="mt-1.5 text-sm text-amber-950/90 dark:text-amber-100/90">
                {briefing.focusAreas.join(" · ")}
              </p>
            </div>
          )}
          {briefing.strengths?.length > 0 && (
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                <FiTrendingUp size={14} /> Your strengths
              </p>
              <p className="mt-1.5 text-sm text-emerald-950/90 dark:text-emerald-100/90">
                {briefing.strengths.join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}

      {briefing.priorities?.length > 0 && (
        <div className="relative mt-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            Recommended order
          </p>
          <ol className="space-y-2">
            {briefing.priorities.map((p, idx) => (
              <li
                key={`${p.slot}-${idx}`}
                className={`flex flex-col gap-1 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  p.completed
                    ? "border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/15"
                    : "border-slate-200/80 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.02]"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <span className="mr-2 tabular-nums text-slate-400">{idx + 1}.</span>
                    {p.subject || p.label}
                    {p.lesson && p.lesson !== p.subject ? (
                      <span className="font-normal text-slate-500"> — {p.lesson}</span>
                    ) : null}
                  </p>
                  {p.why && (
                    <p className="mt-0.5 pl-6 text-xs text-slate-500 dark:text-slate-400">{p.why}</p>
                  )}
                </div>
                <span className="shrink-0 pl-6 text-xs font-medium tabular-nums text-slate-500 sm:pl-0">
                  {p.duration}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {briefing.studyTip && (
        <div className="relative mt-5 flex items-start gap-2 rounded-xl border border-indigo-200/60 bg-indigo-50/40 px-4 py-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <FiZap className="mt-0.5 shrink-0 text-indigo-500" size={16} />
          <p className="text-sm text-indigo-950/90 dark:text-indigo-100/90">{briefing.studyTip}</p>
        </div>
      )}
    </section>
  );
};

export default AiDailyBriefing;
