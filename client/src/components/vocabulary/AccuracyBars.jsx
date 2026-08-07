const AccuracyBars = ({ rows = [], labelKey = "mode" }) => (
  <div className="space-y-4">
    {rows.length ? rows.map((row) => (
      <div key={row[labelKey]}>
        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold capitalize text-slate-700 dark:text-slate-200">
            {String(row[labelKey]).replace(/_/g, " ")}
          </span>
          <span className="font-mono text-xs font-bold text-slate-500">{row.accuracy || 0}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              row.accuracy >= 80 ? "bg-emerald-500" : row.accuracy >= 60 ? "bg-amber-500" : "bg-rose-500"
            }`}
            style={{ width: `${Math.max(2, row.accuracy || 0)}%` }}
          />
        </div>
      </div>
    )) : <p className="text-sm text-slate-500">Complete a drill to populate performance data.</p>}
  </div>
);

export default AccuracyBars;
