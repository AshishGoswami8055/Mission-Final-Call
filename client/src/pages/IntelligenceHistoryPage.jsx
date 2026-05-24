import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { FiBook, FiCalendar, FiTarget, FiTrendingUp, FiVideo } from "react-icons/fi";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../api/client";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import AiDailyBriefing from "../components/mission/AiDailyBriefing";
import DailyTargetProgress from "../components/mission/DailyTargetProgress";
import IntelligenceLogPanel, { LogRow } from "../components/mission/IntelligenceLogPanel";
import MissionStatsRow from "../components/mission/MissionStatsRow";
import StartStudyGate from "../components/mission/StartStudyGate";
import StreakCard from "../components/mission/StreakCard";
import WeeklyPerformanceChart from "../components/mission/WeeklyPerformanceChart";

const IntelligenceHistoryPage = () => {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
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

  const handleStartStudy = async () => {
    setStarting(true);
    try {
      await api.post("/mission/study/start");
      toast.success("Study session started. Intelligence unlocked.");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not start study");
    } finally {
      setStarting(false);
    }
  };

  if (loading && !report) {
    return (
      <Layout title="Study intelligence" subtitle="Loading analytics…" showSearch={false}>
        <Loader label="Building intelligence report…" />
      </Layout>
    );
  }

  if (report?.gate && !report?.studyStarted) {
    return (
      <Layout
        title="Study intelligence"
        subtitle="Analytics unlock after you start today's study"
        showSearch={false}
        actions={
          <Link to="/mission" className="btn-secondary text-sm!">
            Today&apos;s target
          </Link>
        }
      >
        <StartStudyGate
          userName={report.userName}
          dailyTarget={report.dailyTarget}
          starting={starting}
          onStartStudy={handleStartStudy}
        />
      </Layout>
    );
  }

  const overview = report?.overview || {};
  const missionProgress = overview.missionProgress ?? report?.dailyTarget?.progressPercent ?? 0;
  const readingProgress = overview.readingProgress || 0;

  return (
    <Layout
      title="Study intelligence"
      subtitle="Performance insights synced with today's study plan"
      showSearch={false}
      actions={
        <Link to="/mission" className="btn-primary text-sm!">
          Today&apos;s target
        </Link>
      }
    >
      <div className="space-y-5">
        <MissionStatsRow
          daysLeft={overview.examCountdownDays ?? "—"}
          progress={missionProgress}
          streak={overview.streak || 0}
          videoStreak={overview.videoStreak ?? overview.videoStreakStatus?.streak ?? 0}
          totalGoalLabel={report?.dailyTarget?.totalGoalLabel || "—"}
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <DailyTargetProgress
              missionProgress={missionProgress}
              readingProgress={readingProgress}
              label="Today's combined progress"
              totalGoalLabel={report?.dailyTarget?.totalGoalLabel}
            />

            <WeeklyPerformanceChart data={overview.weeklyChart || []} />

            <div className="grid gap-4 lg:grid-cols-2">
              <IntelligenceLogPanel icon={FiCalendar} title="Daily study logs">
                {(report?.dailyLogs || []).slice(0, 20).map((log) => (
                  <LogRow
                    key={log.date}
                    left={log.date}
                    right={`${log.progressPercent}% · ${log.itemsCompleted}/${log.itemsTotal}`}
                  />
                ))}
                {!report?.dailyLogs?.length && (
                  <li className="text-xs text-slate-500">No mission logs yet.</li>
                )}
              </IntelligenceLogPanel>

              <IntelligenceLogPanel icon={FiVideo} title="Videos watched">
                {(report?.videoLogs || []).slice(0, 15).map((log, idx) => (
                  <LogRow
                    key={`${log.date}-${idx}`}
                    left={log.title}
                    sub={`${log.date} · ${log.durationMinutes} min · ${log.subjectName}`}
                  />
                ))}
                {!report?.videoLogs?.length && (
                  <li className="text-xs text-slate-500">No video logs yet.</li>
                )}
              </IntelligenceLogPanel>

              <IntelligenceLogPanel icon={FiBook} title="Reading sessions">
                {(report?.readingLogs || []).slice(0, 15).map((log) => (
                  <LogRow
                    key={log.date}
                    left={log.date}
                    right={`${log.actualMinutes}/${log.targetMinutes} min`}
                  />
                ))}
                {!report?.readingLogs?.length && (
                  <li className="text-xs text-slate-500">No reading sessions yet.</li>
                )}
              </IntelligenceLogPanel>

              <IntelligenceLogPanel icon={FiTarget} title="Mock test history">
                {(report?.mockLogs || []).map((log) => (
                  <LogRow
                    key={`${log.date}-${log.title}`}
                    left={log.title}
                    sub={`${log.date} · Score ${log.score} · ${log.accuracyPercent}% · ${log.timeTakenMinutes} min`}
                  />
                ))}
                {!report?.mockLogs?.length && (
                  <li className="text-xs text-slate-500">No mock tests logged yet.</li>
                )}
              </IntelligenceLogPanel>
            </div>
          </div>

          <aside className="space-y-5">
            {report?.aiBriefing && <AiDailyBriefing briefing={report.aiBriefing} compact />}
            <StreakCard
              streak={overview.streak || 0}
              videoStreak={overview.videoStreak ?? overview.videoStreakStatus?.streak ?? 0}
              readingStreak={overview.readingStreak || 0}
              disciplineScore={overview.disciplineScore || 0}
            />

            <section className="card p-5">
              <div className="flex items-center gap-2">
                <FiTrendingUp size={15} className="text-slate-500" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Monthly insights</h2>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Mission completion</span>
                  <span className="font-semibold tabular-nums">{report?.monthlyInsights?.missionCompletionRate ?? 0}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Consistency</span>
                  <span className="font-semibold tabular-nums">{report?.monthlyInsights?.consistencyScore ?? 0}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total hours</span>
                  <span className="font-semibold tabular-nums">{report?.monthlyInsights?.totalHours ?? 0}h</span>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {report?.monthlyInsights?.periodKey || format(new Date(), "yyyy-MM")}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </Layout>
  );
};

export default IntelligenceHistoryPage;
