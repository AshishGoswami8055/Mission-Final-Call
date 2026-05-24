const StreakCard = ({ streak = 0, readingStreak = 0, disciplineScore = 0 }) => (
  <div className="grid gap-3 sm:grid-cols-3">
    <div className="card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Discipline streak</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {streak} <span className="text-sm font-medium text-slate-500">days</span>
      </p>
    </div>
    <div className="card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Reading streak</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {readingStreak} <span className="text-sm font-medium text-slate-500">days</span>
      </p>
    </div>
    <div className="card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Discipline score</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {disciplineScore} <span className="text-sm font-medium text-slate-500">/100</span>
      </p>
    </div>
  </div>
);

export default StreakCard;
