import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { FiActivity, FiBook, FiCalendar, FiTarget, FiTrendingUp, FiVideo } from "react-icons/fi";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../api/client";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import StreakCard from "../components/mission/StreakCard";
import WeeklyPerformanceChart from "../components/mission/WeeklyPerformanceChart";
import DailyTargetProgress from "../components/mission/DailyTargetProgress";

const IntelligenceHistoryPage = () => {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/mission/analytics/intelligence");
      setReport(data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load intelligence report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !report) {
    return (
      <Layout title="Study intelligence" subtitle="Loading analytics…" showSearch={false}>
        <Loader label="Building intelligence report…" />
      </Layout>
    );
  }

  const overview = report?.overview || {};
  const missionProgress = overview.missionProgress || 0;
  const readingProgress = overview.readingProgress || 0;

  return (
    <Layout
      title="Study intelligence"
      subtitle="Daily logs, trends, consistency, and performance insights"
      showSearch={false}
      actions={
        <Link to="/mission" className="btn-primary text-sm!">
          Today&apos;s mission
        </Link>
      }
    >
      <div className="space-y-6">
        <StreakCard
          streak={overview.streak || 0}
          readingStreak={overview.readingStreak || 0}
          disciplineScore={overview.disciplineScore || 0}
        />

        <DailyTargetProgress
          missionProgress={missionProgress}
          readingProgress={readingProgress}
          label="Today's combined progress"
        />

        <WeeklyPerformanceChart data={overview.weeklyChart || []} />

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#141414]">
            <div className="mb-4 flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <FiCalendar size={16} />
              <h2 className="text-sm font-bold uppercase tracking-wide">Daily study logs</h2>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {(report?.dailyLogs || []).slice(0, 20).map((log) => (
                <li
                  key={log.date}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-white/10"
                >
                  <span className="text-slate-600 dark:text-slate-400">{log.date}</span>
                  <span className="font-medium tabular-nums text-slate-900 dark:text-white">
                    {log.progressPercent}% · {log.itemsCompleted}/{log.itemsTotal}
                  </span>
                </li>
              ))}
              {!report?.dailyLogs?.length && (
                <li className="text-slate-500">No mission logs yet. Complete your first daily mission.</li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#141414]">
            <div className="mb-4 flex items-center gap-2 text-violet-600 dark:text-violet-400">
              <FiVideo size={16} />
              <h2 className="text-sm font-bold uppercase tracking-wide">Videos watched</h2>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {(report?.videoLogs || []).slice(0, 15).map((log, idx) => (
                <li
                  key={`${log.date}-${idx}`}
                  className="rounded-lg border border-slate-100 px-3 py-2 dark:border-white/10"
                >
                  <p className="font-medium text-slate-800 dark:text-slate-100">{log.title}</p>
                  <p className="text-xs text-slate-500">
                    {log.date} · {log.durationMinutes} min · {log.subjectName}
                  </p>
                </li>
              ))}
              {!report?.videoLogs?.length && <li className="text-slate-500">No server-side video logs yet.</li>}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#141414]">
            <div className="mb-4 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <FiBook size={16} />
              <h2 className="text-sm font-bold uppercase tracking-wide">Reading sessions</h2>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {(report?.readingLogs || []).slice(0, 15).map((log) => (
                <li
                  key={log.date}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-white/10"
                >
                  <span>{log.date}</span>
                  <span className="tabular-nums">
                    {log.actualMinutes}/{log.targetMinutes} min
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-[#141414]">
            <div className="mb-4 flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <FiTarget size={16} />
              <h2 className="text-sm font-bold uppercase tracking-wide">Mock test history</h2>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {(report?.mockLogs || []).map((log) => (
                <li
                  key={`${log.date}-${log.title}`}
                  className="rounded-lg border border-slate-100 px-3 py-2 dark:border-white/10"
                >
                  <p className="font-medium">{log.title}</p>
                  <p className="text-xs text-slate-500">
                    {log.date} · Score {log.score} · {log.accuracyPercent}% accuracy · {log.timeTakenMinutes} min
                  </p>
                </li>
              ))}
              {!report?.mockLogs?.length && <li className="text-slate-500">No mock tests logged yet.</li>}
            </ul>
          </section>
        </div>

        <section className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <FiTrendingUp size={18} />
            <h2 className="text-sm font-bold uppercase tracking-wide">Monthly insights</h2>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Mission completion</p>
              <p className="font-display text-2xl font-bold">{report?.monthlyInsights?.missionCompletionRate ?? 0}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Consistency score</p>
              <p className="font-display text-2xl font-bold">{report?.monthlyInsights?.consistencyScore ?? 0}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total study hours</p>
              <p className="font-display text-2xl font-bold">{report?.monthlyInsights?.totalHours ?? 0}h</p>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <FiActivity size={14} />
            Period {report?.monthlyInsights?.periodKey || format(new Date(), "yyyy-MM")} — AI adaptive planning ready
            for future releases.
          </p>
        </section>
      </div>
    </Layout>
  );
};

export default IntelligenceHistoryPage;
