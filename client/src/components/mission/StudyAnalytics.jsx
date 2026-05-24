import { FiTarget, FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import WeeklyPerformanceChart from "./WeeklyPerformanceChart";

const StudyAnalytics = ({ analytics = {} }) => {
  const {
    totalStudyHours = 0,
    missionCompletionRate = 0,
    consistencyScore = 0,
    strongestSubjects = [],
    weakestSubjects = [],
    weeklyChart = [],
    mockTrend = [],
  } = analytics;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total hours</p>
          <p className="font-display mt-1 text-2xl font-bold text-slate-900 dark:text-white">{totalStudyHours}h</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Mission rate</p>
          <p className="font-display mt-1 text-2xl font-bold text-slate-900 dark:text-white">{missionCompletionRate}%</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Consistency</p>
          <p className="font-display mt-1 text-2xl font-bold text-slate-900 dark:text-white">{consistencyScore}%</p>
        </div>
      </div>

      <WeeklyPerformanceChart data={weeklyChart} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <FiTrendingUp size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">Strongest subjects</span>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {strongestSubjects.length ? (
              strongestSubjects.map((s) => <li key={s}>• {s}</li>)
            ) : (
              <li className="text-slate-500">Complete more content to unlock insights.</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <FiTrendingDown size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">Weakest subjects</span>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {weakestSubjects.length ? (
              weakestSubjects.map((s) => <li key={s}>• {s}</li>)
            ) : (
              <li className="text-slate-500">No weak areas detected yet.</li>
            )}
          </ul>
        </div>
      </div>

      {mockTrend.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <FiTarget size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">Mock test trend</span>
          </div>
          <ul className="mt-3 space-y-2">
            {mockTrend.map((m) => (
              <li
                key={`${m.date}-${m.title}`}
                className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300"
              >
                <span className="truncate">{m.title}</span>
                <span className="shrink-0 tabular-nums text-indigo-600 dark:text-indigo-400">
                  {m.accuracyPercent}% acc
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default StudyAnalytics;
