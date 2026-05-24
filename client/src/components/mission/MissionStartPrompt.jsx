import { FiBarChart2, FiClock, FiEdit2, FiPlay, FiPlus, FiTarget } from "react-icons/fi";
import { Link } from "react-router-dom";
import { firstName, getGreeting } from "./TodaysTargetBoard";

const statPill =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]";

const MissionStartPrompt = ({
  userName = "Cadet",
  dailyTarget,
  daysLeft,
  starting = false,
  onStartStudy,
  onEditTask,
  onAddTask,
  showMissionLink = false,
  intelligenceMode = false,
}) => {
  const totalLabel = dailyTarget?.totalGoalLabel || "—";
  const taskCount = (dailyTarget?.targets || []).length || 4;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-8 sm:px-8 sm:py-10 dark:border-white/10">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {getGreeting()}, <span className="font-medium text-slate-800 dark:text-slate-200">{firstName(userName)}</span>
          </p>
          <h2 className="font-display mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-white">
            {intelligenceMode ? "Start study to unlock intelligence" : "Ready for today's mission?"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {intelligenceMode
              ? "Your daily plan is prepared. Begin your session to track progress and view full analytics."
              : "Review or adjust the AI plan below, then start when you're ready."}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={starting}
              onClick={onStartStudy}
            >
              <FiPlay size={16} />
              {starting ? "Starting…" : "Start study"}
            </button>
            {showMissionLink && (
              <Link to="/mission" className="btn-secondary inline-flex items-center gap-2 text-sm!">
                <FiTarget size={16} /> Today&apos;s target
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        <div className={statPill}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Study goal</p>
          <p className="font-display mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{totalLabel}</p>
        </div>
        <div className={statPill}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tasks today</p>
          <p className="font-display mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{taskCount}</p>
        </div>
        <div className={statPill}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {intelligenceMode ? "Unlocks" : "Exam in"}
          </p>
          <p className="font-display mt-1 inline-flex items-center gap-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {intelligenceMode ? (
              <>
                <FiBarChart2 size={18} className="text-slate-500" /> Analytics
              </>
            ) : (
              <>
                {daysLeft ?? "—"} <span className="text-sm font-medium text-slate-500">days</span>
              </>
            )}
          </p>
        </div>
      </div>

      {!intelligenceMode && dailyTarget?.targets?.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-4 sm:px-6 dark:border-white/10">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Plan preview</p>
            {onAddTask && (
              <button type="button" className="btn-ghost text-xs!" onClick={onAddTask}>
                <FiPlus size={14} /> Add task
              </button>
            )}
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {dailyTarget.targets.map((target, index) => (
              <li key={target.itemId || target.slot} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">
                  <span className="mr-2 tabular-nums text-slate-400">{index + 1}.</span>
                  {target.slot === "reading" ? "Reading session" : target.title || target.slot}
                  {target.isManual && <span className="ml-2 text-[10px] uppercase text-slate-400">Manual</span>}
                </span>
                <span className="inline-flex shrink-0 items-center gap-2">
                  <span className="inline-flex items-center gap-1 tabular-nums text-slate-500">
                    <FiClock size={12} />
                    {target.minutesLabel}
                  </span>
                  {onEditTask && (
                    <button
                      type="button"
                      className="btn-ghost p-1.5!"
                      title="Edit task"
                      onClick={() => onEditTask(target)}
                    >
                      <FiEdit2 size={14} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default MissionStartPrompt;
