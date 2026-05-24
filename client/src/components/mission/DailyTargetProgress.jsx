const DailyTargetProgress = ({
  missionProgress = 0,
  readingProgress = 0,
  label = "Mission progress",
  totalGoalLabel,
}) => {
  const combined = Math.round(missionProgress * 0.7 + readingProgress * 0.3);

  return (
    <div className="card p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
          <p className="font-display mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{combined}%</p>
          {totalGoalLabel && (
            <p className="mt-1 text-xs text-slate-500">Today&apos;s goal: {totalGoalLabel}</p>
          )}
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Mission {missionProgress}%</div>
          <div>Reading {readingProgress}%</div>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-slate-900 transition-all duration-700 dark:bg-slate-100"
          style={{ width: `${Math.min(100, combined)}%` }}
        />
      </div>
    </div>
  );
};

export default DailyTargetProgress;
