const DailyTargetProgress = ({
  missionProgress = 0,
  readingProgress = 0,
  label = "Mission progress",
  totalGoalLabel,
}) => {
  const combined = Math.round(missionProgress * 0.7 + readingProgress * 0.3);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#141414]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
          <p className="font-display mt-1 text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
            {combined}%
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {totalGoalLabel && <div className="mb-1 font-medium text-slate-600 dark:text-slate-300">{totalGoalLabel}</div>}
          <div>Mission {missionProgress}%</div>
          <div>Reading {readingProgress}%</div>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-linear-to-r from-emerald-500 via-sky-500 to-indigo-500 transition-all duration-700"
          style={{ width: `${Math.min(100, combined)}%` }}
        />
      </div>
    </div>
  );
};

export default DailyTargetProgress;
