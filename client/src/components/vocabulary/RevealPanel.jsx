import { FiEye } from "react-icons/fi";

const RevealPanel = ({ revealed, disabled, onReveal, onRate }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
    {!revealed ? (
      <button type="button" className="btn-primary w-full sm:w-auto" onClick={onReveal} disabled={disabled}>
        <FiEye /> Reveal answer <span className="text-xs opacity-60">(Space)</span>
      </button>
    ) : (
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">How strong was your recall?</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" className="rounded-xl bg-rose-500/10 px-3 py-3 text-sm font-bold text-rose-600 hover:bg-rose-500/20 dark:text-rose-300" onClick={() => onRate("again")}>Again</button>
          <button type="button" className="rounded-xl bg-amber-500/10 px-3 py-3 text-sm font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300" onClick={() => onRate("good")}>Good</button>
          <button type="button" className="rounded-xl bg-emerald-500/10 px-3 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300" onClick={() => onRate("easy")}>Easy</button>
        </div>
      </div>
    )}
  </div>
);

export default RevealPanel;
