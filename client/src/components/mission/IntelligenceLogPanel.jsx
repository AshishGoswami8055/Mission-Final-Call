const IntelligenceLogPanel = ({ icon: Icon, title, children, emptyMessage }) => (
  <section className="card flex flex-col p-5">
    <div className="mb-3 flex items-center gap-2">
      {Icon && <Icon size={15} className="text-slate-500" />}
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</h2>
    </div>
    <ul className="max-h-56 flex-1 space-y-1.5 overflow-y-auto text-sm">{children}</ul>
    {emptyMessage && (
      <p className="mt-2 text-xs text-slate-500">{emptyMessage}</p>
    )}
  </section>
);

export const LogRow = ({ left, right, sub }) => (
  <li className="rounded-lg border border-slate-100 px-3 py-2 dark:border-white/10">
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">{left}</span>
      {right && <span className="shrink-0 font-medium tabular-nums text-slate-900 dark:text-white">{right}</span>}
    </div>
    {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
  </li>
);

export default IntelligenceLogPanel;
