const statBox =
  "card px-4 py-3";

const MissionStatsRow = ({ daysLeft, progress = 0, streak = 0, videoStreak = 0, totalGoalLabel = "—" }) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    <div className={statBox}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Exam countdown</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {daysLeft} <span className="text-sm font-medium text-slate-500">days</span>
      </p>
    </div>
    <div className={statBox}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Today&apos;s progress</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{progress}%</p>
    </div>
    <div className={statBox}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Video streak</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">
        {videoStreak} <span className="text-sm font-medium text-slate-500">days</span>
      </p>
    </div>
    <div className={statBox}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Discipline streak</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {streak} <span className="text-sm font-medium text-slate-500">days</span>
      </p>
    </div>
    <div className={statBox}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Study goal</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{totalGoalLabel}</p>
    </div>
  </div>
);

export default MissionStatsRow;
