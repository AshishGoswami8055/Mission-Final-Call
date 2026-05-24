import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiCrosshair, FiRefreshCw, FiShield } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { courseExamDate, getDefaultCourseId } from "../../config/courses";
import MissionCard from "./MissionCard";
import ReadingTimer from "./ReadingTimer";
import StreakCard from "./StreakCard";
import DailyTargetProgress from "./DailyTargetProgress";
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
  const analytics = payload?.analytics || {};

  const videoItems = useMemo(
    () => (mission?.items || []).filter((i) => ["english", "maths", "gs"].includes(i.slot)),
    [mission]
  );
  const mockItem = useMemo(
    () => (mission?.items || []).find((i) => i.slot === "mock_test"),
    [mission]
  );

  const missionProgress = mission?.progressPercent || 0;
  const readingTarget = reading?.targetMinutes || 60;
  const readingActual = reading?.actualMinutes || 0;
  const readingProgress = Math.min(100, Math.round((readingActual / readingTarget) * 100));

  const handleComplete = async (item) => {
    setCompletingSlot(item.slot);
    try {
      await api.post("/mission/items/complete", {
        slot: item.slot,
        contentId: item.contentId,
        paperId: item.paperId,
      });
      toast.success("Mission item marked complete.");
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
        toast.success("Reading session complete.");
        await load();
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not complete reading");
      } finally {
        setBusy(false);
      }
    },
    onUpdateTarget: async (targetMinutes) => {
      try {
        await api.put("/mission/reading/target", { targetMinutes });
        await load();
      } catch {
        toast.error("Could not update reading target");
      }
    },
  };

  if (loading && !payload) {
    return <Loader label="Loading today's mission…" />;
  }

  const daysLeft = payload?.examCountdownDays ?? getCountdown();

  return (
    <div className="space-y-6">
      {/* Hero command header */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-linear-to-br from-slate-900 via-[#0c1220] to-[#141414] p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sky-400">
              <FiShield size={18} />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Mission Final Call</span>
            </div>
            <h1 className="font-display mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Today&apos;s Target
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Your AI-guided daily mission — English, Maths, GS, and reading. Execute with discipline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Exam in</p>
              <p className="font-display text-3xl font-bold tabular-nums text-rose-400">{daysLeft}</p>
              <p className="text-[10px] text-slate-500">days</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Study hours</p>
              <p className="font-display text-3xl font-bold tabular-nums">{payload?.totalStudyHours ?? 0}</p>
              <p className="text-[10px] text-slate-500">total logged</p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10"
              onClick={async () => {
                try {
                  await api.post("/mission/today/regenerate");
                  toast.success("Mission regenerated.");
                  load();
                } catch {
                  toast.error("Could not regenerate");
                }
              }}
            >
              <FiRefreshCw size={14} /> Regenerate
            </button>
          </div>
        </div>
      </section>

      <StreakCard
        streak={payload?.streak || 0}
        readingStreak={payload?.readingStreak || 0}
        disciplineScore={analytics.disciplineScore || mission?.disciplineScore || 0}
      />

      <DailyTargetProgress missionProgress={missionProgress} readingProgress={readingProgress} />

      <section>
        <div className="mb-4 flex items-center gap-2">
          <FiCrosshair className="text-sky-500" />
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Mission objectives
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {videoItems.map((item) => (
            <MissionCard
              key={item.slot}
              item={item}
              onComplete={handleComplete}
              onOpen={handleOpen}
              completing={completingSlot === item.slot}
            />
          ))}
        </div>
      </section>

      <ReadingTimer reading={reading} busy={busy} {...readingActions} />

      {mockItem && !mockItem.completed && (
        <SundayMockDashboard mockItem={mockItem} onSubmitted={load} />
      )}

      <StudyAnalytics analytics={payload?.analytics || {}} />
    </div>
  );
};

export default MissionDashboard;
