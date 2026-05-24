import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { courseExamDate, getDefaultCourseId } from "../../config/courses";
import TodaysTargetBoard from "./TodaysTargetBoard";
import ReadingTimer from "./ReadingTimer";
import StreakCard from "./StreakCard";
import StudyAnalytics from "./StudyAnalytics";
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
  const [completingSlot, setCompletingSlot] = useState(null);
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
  const analytics = payload?.analytics || {};

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
      toast.success(`${target.label} marked complete.`);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update mission");
    } finally {
      setCompletingSlot(null);
    }
  };

  const handleOpen = (href) => navigate(href);

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
        toast.success("Reading session complete — 1 hour target updated.");
        await load();
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not complete reading");
      } finally {
        setBusy(false);
      }
    },
    onUpdateTarget: async (targetMinutes) => {
      if (targetMinutes !== 60) {
        toast("Daily reading target is set to 1 hour for structured CDS prep.", { icon: "📖" });
      }
      try {
        await api.put("/mission/reading/target", { targetMinutes: 60 });
        await load();
      } catch {
        toast.error("Could not update reading target");
      }
    },
  };

  if (loading && !payload) {
    return <Loader label="Loading today's target…" />;
  }

  const daysLeft = payload?.examCountdownDays ?? getCountdown();
  const displayName = payload?.userName || user?.name || "Ashish";

  return (
    <div className="space-y-6">
      <TodaysTargetBoard
        userName={displayName}
        dailyTarget={dailyTarget}
        onLaunch={handleOpen}
        onComplete={handleComplete}
        onReadingFocus={() => {
          document.getElementById("reading-timer-section")?.scrollIntoView({ behavior: "smooth" });
        }}
        completingSlot={completingSlot}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#141414]">
        <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
          <span>
            Exam in <strong className="text-rose-500">{daysLeft}</strong> days
          </span>
          <span>
            Discipline streak <strong>{payload?.streak || 0}</strong> days
          </span>
          <span>
            Score <strong>{analytics.disciplineScore || 0}</strong>/100
          </span>
        </div>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2 text-xs!"
          onClick={async () => {
            try {
              await api.post("/mission/today/regenerate");
              toast.success("Today's 3 videos refreshed.");
              load();
            } catch {
              toast.error("Could not regenerate");
            }
          }}
        >
          <FiRefreshCw size={14} /> Refresh videos
        </button>
      </div>

      <div id="reading-timer-section">
        <ReadingTimer reading={reading} busy={busy} {...readingActions} />
      </div>

      {mockItem && !mockItem.completed && (
        <SundayMockDashboard mockItem={mockItem} onSubmitted={load} />
      )}

      <StreakCard
        streak={payload?.streak || 0}
        readingStreak={payload?.readingStreak || 0}
        disciplineScore={analytics.disciplineScore || mission?.disciplineScore || 0}
      />

      <StudyAnalytics analytics={payload?.analytics || {}} />
    </div>
  );
};

export default MissionDashboard;
