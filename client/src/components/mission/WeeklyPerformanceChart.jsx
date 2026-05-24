const WeeklyPerformanceChart = ({ data = [] }) => {
  const max = Math.max(1, ...data.map((d) => d.minutes || 0));

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#141414]">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Weekly performance</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Study minutes — last 7 days</p>
      <div className="mt-5 flex items-end justify-between gap-2" style={{ minHeight: 120 }}>
        {data.map((entry) => {
          const pct = Math.max(4, Math.round(((entry.minutes || 0) / max) * 100));
          const day = entry.date?.slice(5) || "";
          return (
            <div key={entry.date} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-[10px] tabular-nums text-slate-500">{entry.minutes || 0}m</span>
              <div
                className="w-full max-w-8 rounded-t-md bg-linear-to-t from-indigo-600 to-sky-400 transition-all"
                style={{ height: `${pct}px` }}
                title={`${entry.date}: ${entry.minutes} min`}
              />
              <span className="text-[10px] font-medium text-slate-400">{day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeeklyPerformanceChart;
