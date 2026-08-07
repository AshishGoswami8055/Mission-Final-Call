import { createElement } from "react";
import { FiAlertTriangle, FiAward, FiClock, FiLayers, FiTrendingUp, FiZap } from "react-icons/fi";

const stats = [
  { key: "dueToday", label: "Due today", icon: FiClock, tone: "text-amber-400" },
  { key: "new", label: "New items", icon: FiZap, tone: "text-sky-400" },
  { key: "weak", label: "Weak words", icon: FiAlertTriangle, tone: "text-rose-400" },
  { key: "mastered", label: "Mastered", icon: FiAward, tone: "text-emerald-400" },
  { key: "total", label: "Total arsenal", icon: FiLayers, tone: "text-violet-400" },
];

const VocabularyStatsGrid = ({ counts = {}, streak = 0, accuracy = 0 }) => (
  <section className="grid grid-cols-2 gap-3 lg:grid-cols-7">
    {stats.map((stat) => (
      <article key={stat.key} className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/[0.07] dark:bg-[#151515]">
        <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${stat.tone}`}>
          {createElement(stat.icon, { size: 15 })} {stat.label}
        </div>
        <p className="mt-3 font-display text-3xl font-black tabular-nums text-slate-950 dark:text-white">
          {counts[stat.key] || 0}
        </p>
      </article>
    ))}
    <article className="rounded-2xl border border-indigo-500/25 bg-indigo-500/10 p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">
        <FiTrendingUp size={15} /> Practice streak
      </div>
      <p className="mt-3 font-display text-3xl font-black tabular-nums text-indigo-950 dark:text-white">
        {streak} <span className="text-sm font-semibold text-indigo-500 dark:text-indigo-300">days</span>
      </p>
    </article>
    <article className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-300">
        <FiTrendingUp size={15} /> 30-day accuracy
      </div>
      <p className="mt-3 font-display text-3xl font-black tabular-nums text-sky-950 dark:text-white">
        {accuracy}<span className="text-sm font-semibold text-sky-600 dark:text-sky-300">%</span>
      </p>
    </article>
  </section>
);

export default VocabularyStatsGrid;
