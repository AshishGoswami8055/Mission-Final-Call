import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiBarChart2, FiRefreshCw } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { courseExamDate, getDefaultCourseId } from "../../config/courses";
import AiDailyBriefing from "./AiDailyBriefing";
import MissionStartPrompt from "./MissionStartPrompt";
import MissionStatsRow from "./MissionStatsRow";
import TodaysTargetBoard from "./TodaysTargetBoard";
import ReadingTimer from "./ReadingTimer";
import SundayMockDashboard from "./SundayMockDashboard";
import Loader from "../Loader";

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
    return <Loader label="Preparing your study plan…" />;
  }

  const daysLeft = payload?.examCountdownDays ?? getCountdown();
  const displayName = payload?.userName || user?.name || "Cadet";
  const progress = dailyTarget?.progressPercent ?? 0;

  if (!studyStarted) {
    return (
      <MissionStartPrompt
        userName={displayName}
        dailyTarget={dailyTarget}
        daysLeft={daysLeft}
        starting={startingStudy}
        onStartStudy={handleStartStudy}
      />
    );
  }

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      <Link to="/history/intelligence" className="btn-ghost text-xs!">
        <FiBarChart2 size={14} /> Analytics
      </Link>
      <button
        type="button"
        className="btn-ghost text-xs!"
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
        <FiRefreshCw size={14} /> Refresh
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <MissionStatsRow
        daysLeft={daysLeft}
        progress={progress}
        streak={payload?.streak || 0}
        totalGoalLabel={dailyTarget?.totalGoalLabel || "—"}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <TodaysTargetBoard
            userName={displayName}
            dailyTarget={dailyTarget}
            headerActions={headerActions}
            onLaunch={(href) => navigate(href)}
            onComplete={handleComplete}
            onReadingFocus={() => {
              document.getElementById("reading-timer-section")?.scrollIntoView({ behavior: "smooth" });
            }}
            completingSlot={completingSlot}
          />

          {mockItem && !mockItem.completed && <SundayMockDashboard mockItem={mockItem} onSubmitted={load} />}
        </div>

        <aside className="space-y-5">
          <AiDailyBriefing
            briefing={aiBriefing}
            onRefresh={refreshAi}
            refreshing={refreshingAi}
            compact
          />
          <div id="reading-timer-section">
            <ReadingTimer reading={reading} busy={busy} compact {...readingActions} />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default MissionDashboard;
