import { FiAlertCircle, FiArrowRight } from "react-icons/fi";

const WeakWordList = ({ items = [], onPractice }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#151515]">
    {items.length ? items.map((item, index) => (
      <div key={item._id} className="flex items-center gap-4 border-b border-slate-100 p-4 last:border-0 dark:border-white/[0.06]">
        <span className="font-mono text-xs font-bold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-bold text-slate-950 dark:text-white">{item.word}</p>
            <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-rose-500">score {item.weakScore}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">{item.meaning}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-rose-500">{item.wrongCount || 0} misses</p>
          <p className="text-[11px] text-slate-400">{item.confidence || 0}% confidence</p>
        </div>
      </div>
    )) : (
      <div className="p-8 text-center">
        <FiAlertCircle className="mx-auto text-emerald-500" size={28} />
        <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">No weak words yet.</p>
      </div>
    )}
    {items.length && onPractice ? (
      <button type="button" className="flex w-full items-center justify-center gap-2 border-t border-slate-100 p-4 text-sm font-bold text-indigo-600 hover:bg-indigo-500/5 dark:border-white/[0.06] dark:text-indigo-300" onClick={onPractice}>
        Start weak-word recovery <FiArrowRight />
      </button>
    ) : null}
  </div>
);

export default WeakWordList;
