import { FiCpu, FiRefreshCw, FiZap } from "react-icons/fi";

const AiDailyBriefing = ({ briefing, onRefresh, refreshing = false, compact = false }) => {
  if (!briefing) return null;

  const isAi = briefing.source === "ai";

  return (
    <section className={`card p-5 ${compact ? "" : "sm:p-6"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
            <FiCpu size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">AI study coach</p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:bg-white/10 dark:text-slate-400">
                {isAi ? "GPT" : "Smart plan"}
              </span>
            </div>
            <h2 className={`font-display mt-1 font-semibold text-slate-900 dark:text-slate-50 ${compact ? "text-base" : "text-lg"}`}>
              {briefing.headline}
            </h2>
            <p className={`mt-1.5 text-slate-600 dark:text-slate-400 ${compact ? "line-clamp-3 text-xs leading-relaxed" : "text-sm leading-relaxed"}`}>
              {briefing.summary}
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            type="button"
            className="btn-ghost shrink-0 p-2!"
            disabled={refreshing}
            onClick={onRefresh}
            title="Refresh AI plan"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {(briefing.focusAreas?.length > 0 || briefing.strengths?.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {briefing.focusAreas?.map((area) => (
            <span
              key={`focus-${area}`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
            >
              Focus: {area}
            </span>
          ))}
          {briefing.strengths?.map((area) => (
            <span
              key={`strong-${area}`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
            >
              Strong: {area}
            </span>
          ))}
        </div>
      )}

      {!compact && briefing.priorities?.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Recommended order</p>
          <ol className="space-y-1.5">
            {briefing.priorities.map((p, idx) => (
              <li
                key={`${p.slot}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-white/10"
              >
                <span className="min-w-0 truncate text-slate-800 dark:text-slate-200">
                  <span className="mr-2 tabular-nums text-slate-400">{idx + 1}.</span>
                  {p.subject || p.label}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">{p.duration}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {briefing.studyTip && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
          <FiZap className="mt-0.5 shrink-0 text-slate-500" size={14} />
          <p className={`text-slate-600 dark:text-slate-400 ${compact ? "text-xs leading-relaxed" : "text-sm"}`}>
            {briefing.studyTip}
          </p>
        </div>
      )}
    </section>
  );
};

export default AiDailyBriefing;
