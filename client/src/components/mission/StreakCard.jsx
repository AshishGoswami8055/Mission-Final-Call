import { FiAward, FiTrendingUp } from "react-icons/fi";

const StreakCard = ({ streak = 0, readingStreak = 0, disciplineScore = 0 }) => (
  <div className="grid gap-3 sm:grid-cols-3">
    <div className="rounded-2xl border border-amber-500/30 bg-linear-to-br from-amber-500/10 to-orange-500/5 p-4 dark:border-amber-500/20">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <FiTrendingUp size={16} />
        <span className="text-[10px] font-bold uppercase tracking-widest">Discipline streak</span>
      </div>
      <p className="font-display mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
        {streak}
        <span className="ml-1 text-sm font-medium text-slate-500">days</span>
      </p>
    </div>
    <div className="rounded-2xl border border-emerald-500/30 bg-linear-to-br from-emerald-500/10 to-teal-500/5 p-4 dark:border-emerald-500/20">
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <FiAward size={16} />
        <span className="text-[10px] font-bold uppercase tracking-widest">Reading streak</span>
      </div>
      <p className="font-display mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
        {readingStreak}
        <span className="ml-1 text-sm font-medium text-slate-500">days</span>
      </p>
    </div>
    <div className="rounded-2xl border border-indigo-500/30 bg-linear-to-br from-indigo-500/10 to-violet-500/5 p-4 dark:border-indigo-500/20">
      <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
        Discipline score
      </div>
      <p className="font-display mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
        {disciplineScore}
        <span className="ml-1 text-sm font-medium text-slate-500">/100</span>
      </p>
    </div>
  </div>
);

export default StreakCard;
