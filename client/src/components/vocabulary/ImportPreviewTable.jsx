const statusTone = {
  new: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  update: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  error: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
};

const ImportPreviewTable = ({ rows = [] }) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/[0.08]">
    <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-white/[0.08]">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-white/[0.04]">
        <tr>
          <th className="px-4 py-3">Row</th>
          <th className="px-4 py-3">Word / phrase</th>
          <th className="px-4 py-3">Meaning</th>
          <th className="px-4 py-3">Type</th>
          <th className="px-4 py-3">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white dark:divide-white/[0.06] dark:bg-[#151515]">
        {rows.slice(0, 100).map((row) => (
          <tr key={row.rowNumber}>
            <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.rowNumber}</td>
            <td className="max-w-52 px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{row.data.word || "—"}</td>
            <td className="max-w-sm truncate px-4 py-3 text-slate-500">{row.data.meaning || "—"}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{row.data.type}</td>
            <td className="px-4 py-3">
              <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${statusTone[row.status] || statusTone.error}`}>
                {row.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ImportPreviewTable;
