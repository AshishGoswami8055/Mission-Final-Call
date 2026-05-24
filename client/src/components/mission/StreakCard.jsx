const StreakCard = ({ streak = 0, videoStreak = 0, readingStreak = 0, disciplineScore = 0 }) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <div className="card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Video streak</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">
        {videoStreak} <span className="text-sm font-medium text-slate-500">days</span>
      </p>
      <p className="mt-1 text-[11px] text-slate-400">1 hour video/day keeps the fire alive</p>
    </div>
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
