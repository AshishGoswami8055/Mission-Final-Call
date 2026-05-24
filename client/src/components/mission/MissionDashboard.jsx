import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiBarChart2, FiPlay, FiRefreshCw } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { courseExamDate, getDefaultCourseId } from "../../config/courses";
import AiDailyBriefing from "./AiDailyBriefing";
import TodaysTargetBoard from "./TodaysTargetBoard";
import ReadingTimer from "./ReadingTimer";
import SundayMockDashboard from "./SundayMockDashboard";
import Loader from "../Loader";

const statBox =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]";

const getCountdown = () => {
  const exam = courseExamDate(getDefaultCourseId());
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  exam.setHours(0, 0, 0, 0);
  return Math.ceil((exam - now) / 86400000);
};

const MissionDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshingAi, setRefreshingAi] = useState(false);
  const [completingSlot, setCompletingSlot] = useState(null);
  const [startingStudy, setStartingStudy] = useState(false);
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/mission/today");
      setPayload(data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load mission");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mission = payload?.mission;
  const reading = payload?.reading;
  const dailyTarget = payload?.dailyTarget;
  const aiBriefing = payload?.aiBriefing;

  const studyStarted = payload?.studyStarted ?? false;

  const handleStartStudy = async () => {
    setStartingStudy(true);
    try {
      const { data } = await api.post("/mission/study/start");
      setPayload((prev) => ({
        ...prev,
        studyStarted: true,
        studyStartedAt: data.studyStartedAt,
        aiBriefing: data.aiBriefing || prev?.aiBriefing,
        dailyTarget: data.dailyTarget || prev?.dailyTarget,
      }));
      toast.success("Study session started.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not start study");
    } finally {
      setStartingStudy(false);
    }
  };

  const mockItem = useMemo(
    () => (mission?.items || []).find((i) => i.slot === "mock_test"),
    [mission]
  );

  const handleComplete = async (target) => {
    setCompletingSlot(target.slot);
    try {
      await api.post("/mission/items/complete", {
        slot: target.slot,
        contentId: target.contentId,
      });
      toast.success("Marked complete.");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update");
    } finally {
      setCompletingSlot(null);
    }
  };

  const refreshAi = async () => {
    setRefreshingAi(true);
    try {
      const { data } = await api.post("/mission/ai-briefing/refresh");
      setPayload((prev) => ({
        ...prev,
        aiBriefing: data.aiBriefing,
        dailyTarget: data.dailyTarget || prev?.dailyTarget,
      }));
      toast.success("AI study plan updated.");
    } catch {
      toast.error("Could not refresh AI briefing");
    } finally {
      setRefreshingAi(false);
    }
  };

  const readingActions = {
    onStart: async () => {
      setBusy(true);
      try {
        await api.post("/mission/reading/start");
        await load();
      } finally {
        setBusy(false);
      }
    },
    onPause: async (elapsedSeconds) => {
      setBusy(true);
      try {
        await api.post("/mission/reading/pause", { elapsedSeconds });
        await load();
      } finally {
        setBusy(false);
      }
    },
    onResume: async () => {
      setBusy(true);
      try {
        await api.post("/mission/reading/resume");
        await load();
      } finally {
        setBusy(false);
      }
    },
    onComplete: async (elapsedSeconds) => {
      setBusy(true);
      try {
        await api.post("/mission/reading/complete", { elapsedSeconds });
        toast.success("Reading session logged.");
        await load();
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not complete reading");
      } finally {
        setBusy(false);
      }
    },
    onUpdateTarget: async () => {},
  };

  if (loading && !payload) {
    return <Loader label="Preparing your AI study plan…" />;
  }

  const daysLeft = payload?.examCountdownDays ?? getCountdown();
  const displayName = payload?.userName || user?.name || "Cadet";
  const progress = dailyTarget?.progressPercent ?? 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {!studyStarted && (
        <section className="rounded-2xl border border-indigo-200/80 bg-linear-to-br from-indigo-500/5 via-white to-sky-500/5 p-5 dark:border-indigo-900/40 dark:from-indigo-950/30 dark:via-[#1a1a1a] dark:to-sky-950/20 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                Ready to begin?
              </p>
              <h2 className="font-display mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                Start today&apos;s study to unlock intelligence
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Your plan is ready — {dailyTarget?.totalGoalLabel || "today's goal"} across videos and reading.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary inline-flex shrink-0 items-center gap-2 self-start"
              disabled={startingStudy}
              onClick={handleStartStudy}
            >
              <FiPlay size={16} />
              {startingStudy ? "Starting…" : "Start study"}
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={statBox}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Exam countdown</p>
          <p className="font-display mt-1 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {daysLeft} <span className="text-sm font-medium text-slate-500">days</span>
          </p>
        </div>
        <div className={statBox}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Today&apos;s progress</p>
          <p className="font-display mt-1 text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {progress}%
          </p>
        </div>
        <div className={statBox}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Discipline streak</p>
          <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {payload?.streak || 0} <span className="text-sm font-medium text-slate-500">days</span>
          </p>
        </div>
        <div className={statBox}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Study goal</p>
          <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {dailyTarget?.totalGoalLabel || "—"}
          </p>
        </div>
      </div>

      <AiDailyBriefing briefing={aiBriefing} onRefresh={refreshAi} refreshing={refreshingAi} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          to="/history/intelligence"
          className={`btn-secondary inline-flex items-center gap-2 text-xs! ${!studyStarted ? "opacity-60" : ""}`}
          title={!studyStarted ? "Start study first to unlock full analytics" : undefined}
        >
          <FiBarChart2 size={14} /> Full analytics
        </Link>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2 text-xs!"
          onClick={async () => {
            try {
              await api.post("/mission/today/regenerate");
              await refreshAi();
              toast.success("Today's videos refreshed.");
            } catch {
              toast.error("Could not refresh plan");
            }
          }}
        >
          <FiRefreshCw size={14} /> Refresh videos
        </button>
      </div>

      <TodaysTargetBoard
        userName={displayName}
        dailyTarget={dailyTarget}
        onLaunch={(href) => navigate(href)}
        onComplete={handleComplete}
        onReadingFocus={() => {
          document.getElementById("reading-timer-section")?.scrollIntoView({ behavior: "smooth" });
        }}
        completingSlot={completingSlot}
      />

      <div id="reading-timer-section">
        <ReadingTimer reading={reading} busy={busy} {...readingActions} />
      </div>

      {mockItem && !mockItem.completed && (
        <SundayMockDashboard mockItem={mockItem} onSubmitted={load} />
      )}
    </div>
  );
};

export default MissionDashboard;
