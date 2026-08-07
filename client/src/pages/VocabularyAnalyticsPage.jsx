import { createElement } from "react";
import { FiActivity, FiAlertTriangle, FiAward, FiBookOpen, FiClock } from "react-icons/fi";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import AccuracyBars from "../components/vocabulary/AccuracyBars";
import VocabularyHeader from "../components/vocabulary/VocabularyHeader";
import useVocabularyAnalytics from "../hooks/useVocabularyAnalytics";

const VocabularyAnalyticsPage = () => {
  const { data, loading, error } = useVocabularyAnalytics();
  if (loading) {
    return <Layout title="Vocabulary Analytics"><div className="flex min-h-[65vh] items-center justify-center"><Loader label="Building performance report…" /></div></Layout>;
  }

  const stats = [
    { label: "Stored", value: data?.totals?.stored || 0, icon: FiBookOpen, tone: "text-sky-400" },
    { label: "Mastered", value: data?.totals?.mastered || 0, icon: FiAward, tone: "text-emerald-400" },
    { label: "Weak", value: data?.totals?.weak || 0, icon: FiAlertTriangle, tone: "text-rose-400" },
    { label: "Streak", value: `${data?.streak || 0}d`, icon: FiActivity, tone: "text-violet-400" },
  ];

  return (
    <Layout title="Vocabulary Analytics">
      <div className="space-y-5">
        <VocabularyHeader
          backTo="/vocabulary"
          eyebrow="PERFORMANCE INTELLIGENCE"
          title="Vocabulary Analytics"
          subtitle="See where recall is becoming automatic and where CDS English can still take marks away."
          actions={false}
        />
        {error ? <p className="rounded-xl bg-rose-500/10 p-4 text-rose-500">{error}</p> : null}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-[#151515]">
              {createElement(stat.icon, { className: stat.tone })}
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
              <p className="mt-1 font-display text-3xl font-black text-slate-950 dark:text-white">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-[#151515]">
            <h2 className="font-display text-xl font-black text-slate-950 dark:text-white">14-day accuracy</h2>
            <div className="mt-6 flex h-44 items-end gap-2">
              {(data?.dailyAccuracy || []).map((day) => (
                <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[9px] font-bold text-slate-400">{day.total ? `${day.accuracy}%` : ""}</span>
                  <div className="w-full rounded-t-md bg-indigo-500/15" style={{ height: `${Math.max(4, day.accuracy * 1.15)}px` }}>
                    <div className="h-full rounded-t-md bg-indigo-500" style={{ opacity: day.total ? 1 : 0.15 }} />
                  </div>
                  <span className="hidden text-[9px] text-slate-400 sm:block">{day.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-[#151515]">
            <h2 className="font-display text-xl font-black text-slate-950 dark:text-white">Mode performance</h2>
            <div className="mt-6"><AccuracyBars rows={data?.modePerformance || []} /></div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-[#151515]">
            <h2 className="font-display text-xl font-black text-slate-950 dark:text-white">Most missed words</h2>
            <div className="mt-4 divide-y divide-slate-100 dark:divide-white/[0.06]">
              {(data?.mostMissed || []).map((item) => (
                <div key={item._id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0"><p className="font-bold text-slate-900 dark:text-white">{item.word}</p><p className="truncate text-xs text-slate-500">{item.meaning}</p></div>
                  <span className="shrink-0 rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-500">{item.wrongCount} misses</span>
                </div>
              ))}
              {!data?.mostMissed?.length ? <p className="py-6 text-sm text-slate-500">No misses logged yet.</p> : null}
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-[#151515]">
            <h2 className="flex items-center gap-2 font-display text-xl font-black text-slate-950 dark:text-white"><FiClock /> Review queue health</h2>
            <div className="mt-5 space-y-3">
              {[
                ["Overdue", data?.reviewQueue?.overdue || 0, "text-rose-500"],
                ["Due now", data?.reviewQueue?.dueToday || 0, "text-amber-500"],
                ["Next 7 days", data?.reviewQueue?.nextSevenDays || 0, "text-sky-500"],
              ].map(([label, value, tone]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-slate-100 p-3 dark:bg-white/[0.05]">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</span>
                  <span className={`font-display text-xl font-black ${tone}`}>{value}</span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-5"><h2 className="font-display text-lg font-black text-slate-950 dark:text-white">Strongest categories</h2><div className="mt-4"><AccuracyBars rows={data?.strongestCategories || []} labelKey="category" /></div></article>
          <article className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.05] p-5"><h2 className="font-display text-lg font-black text-slate-950 dark:text-white">Weakest categories</h2><div className="mt-4"><AccuracyBars rows={data?.weakestCategories || []} labelKey="category" /></div></article>
        </section>
      </div>
    </Layout>
  );
};

export default VocabularyAnalyticsPage;
