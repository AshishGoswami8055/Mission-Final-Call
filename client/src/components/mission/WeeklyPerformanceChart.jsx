const WeeklyPerformanceChart = ({ data = [] }) => {
  const max = Math.max(1, ...data.map((d) => d.minutes || 0));

  return (
    <div className="card p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Weekly performance</p>
      <p className="mt-1 text-xs text-slate-500">Study minutes — last 7 days</p>
      <div className="mt-5 flex items-end justify-between gap-2" style={{ minHeight: 112 }}>
        {data.map((entry) => {
          const pct = Math.max(4, Math.round(((entry.minutes || 0) / max) * 100));
          const day = entry.date?.slice(5) || "";
          return (
            <div key={entry.date} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-[10px] tabular-nums text-slate-500">{entry.minutes || 0}m</span>
              <div
                className="w-full max-w-8 rounded-t bg-slate-800 transition-all dark:bg-slate-200"
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
