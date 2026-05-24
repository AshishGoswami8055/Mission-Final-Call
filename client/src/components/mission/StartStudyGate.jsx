import { FiArrowRight, FiLock, FiPlay, FiTarget } from "react-icons/fi";
import { Link } from "react-router-dom";
import AiDailyBriefing from "./AiDailyBriefing";
import TodaysTargetBoard from "./TodaysTargetBoard";

const shell =
  "rounded-2xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-[#1a1a1a]";

const StartStudyGate = ({
  userName = "Cadet",
  dailyTarget,
  aiBriefing,
  message,
  starting = false,
  onStartStudy,
}) => (
  <div className="space-y-6">
    <section className={`${shell} overflow-hidden`}>
      <div className="border-b border-slate-100 bg-linear-to-br from-indigo-500/5 via-white to-sky-500/5 px-5 py-8 dark:border-white/10 dark:from-indigo-950/30 dark:via-[#1a1a1a] dark:to-sky-950/20 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
            <FiLock size={26} />
          </span>
          <h2 className="font-display mt-5 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
            Start study first
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
            {message ||
              "Study intelligence unlocks once you begin today's mission. Review your plan below, then start when you're ready."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={starting}
              onClick={onStartStudy}
            >
              <FiPlay size={16} />
              {starting ? "Starting…" : "Start today's study"}
            </button>
            <Link to="/mission" className="btn-secondary inline-flex items-center gap-2 text-sm!">
              <FiTarget size={16} /> Open today&apos;s target
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:grid-cols-3 sm:px-8 sm:py-6">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Today&apos;s goal</p>
          <p className="font-display mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {dailyTarget?.totalGoalLabel || "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Videos + reading</p>
          <p className="font-display mt-1 text-xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {(dailyTarget?.targets || []).length || 4} tasks
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">After start</p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            Full intelligence <FiArrowRight size={14} />
          </p>
        </div>
      </div>
    </section>

    {aiBriefing && <AiDailyBriefing briefing={aiBriefing} />}

    {dailyTarget && (
      <TodaysTargetBoard userName={userName} dailyTarget={dailyTarget} />
    )}
  </div>
);

export default StartStudyGate;
