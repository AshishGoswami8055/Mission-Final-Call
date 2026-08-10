import toast from "react-hot-toast";
import {
  FiArrowRight,
  FiBookOpen,
  FiClock,
  FiGitBranch,
  FiTarget,
  FiUpload,
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import PracticeModePicker from "../components/vocabulary/PracticeModePicker";
import VocabularyHeader from "../components/vocabulary/VocabularyHeader";
import VocabularyStatsGrid from "../components/vocabulary/VocabularyStatsGrid";
import useVocabularyDashboard from "../hooks/useVocabularyDashboard";
import { ARENA_LEGACY_MODES, CDS_EXAM_MODES, VOCABULARY_MODES, formatPracticeMode, isCdsExamMode, isTimedMode, sessionDurationSeconds } from "../utils/vocabularyArena";

const VocabularyDashboardPage = () => {
  const navigate = useNavigate();
  const { data, loading, error } = useVocabularyDashboard();

  const startQuickSession = async (mode, questionCount = 10) => {
    try {
      const timed = isTimedMode(mode);
      const response = await api.post("/vocabulary/session/start", {
        mode,
        questionCount,
        timed,
        examMode: mode === "exam" || isCdsExamMode(mode),
        durationSeconds: sessionDurationSeconds(mode, questionCount),
      });
      navigate(`/vocabulary/session/${response.data.session.sessionId}`);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || "Could not start drill.");
    }
  };

  if (loading) {
    return <Layout title="Vocabulary Arena"><div className="flex min-h-[60vh] items-center justify-center"><Loader label="Preparing the Arena…" /></div></Layout>;
  }

  return (
    <Layout title="Vocabulary Arena" subtitle="Active recall built for CDS English">
      <div className="space-y-5">
        <VocabularyHeader />
        {error ? <p className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
        <VocabularyStatsGrid
          counts={data.counts}
          streak={data.consistency?.streak}
          accuracy={data.consistency?.accuracyLast30Days}
        />

        <section className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white dark:border-white/[0.08] sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">TODAY&apos;S DIRECTIVE</p>
            <h2 className="mt-2 font-display text-3xl font-black">
              {data.counts?.dueToday
                ? `${data.counts.dueToday} words are ready for retrieval.`
                : "Your review queue is clear. Train exam speed."}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              Recommended: {formatPracticeMode(data.recommendedMode)}.{" "}
              {data.consistency?.accuracyLast30Days
                ? `${data.consistency.accuracyLast30Days}% accuracy over the last 30 days.`
                : "Every answer updates confidence and the explainable review schedule."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" className="btn-primary bg-amber-400 text-slate-950 hover:bg-amber-300" onClick={() => startQuickSession("timed", 10)}>
                <FiClock /> Timed drill (10 Q)
              </button>
              <button type="button" className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold hover:bg-white/5" onClick={() => startQuickSession("exam", 20)}>
                Start exam mode <FiArrowRight className="inline" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/vocabulary/weak" className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 transition hover:bg-rose-500/15">
              <FiTarget className="text-rose-500" />
              <p className="mt-4 font-display font-bold text-slate-950 dark:text-white">Weak words</p>
              <p className="mt-1 text-xs text-slate-500">{data.counts?.weak || 0} prioritized</p>
            </Link>
            <Link to="/vocabulary/roots" className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4 transition hover:bg-violet-500/15">
              <FiGitBranch className="text-violet-500" />
              <p className="mt-4 font-display font-bold text-slate-950 dark:text-white">Root lab</p>
              <p className="mt-1 text-xs text-slate-500">{data.counts?.rootFamilies || 0} families</p>
            </Link>
            <Link to="/vocabulary/import" className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 transition hover:bg-sky-500/15">
              <FiUpload className="text-sky-500" />
              <p className="mt-4 font-display font-bold text-slate-950 dark:text-white">Import</p>
              <p className="mt-1 text-xs text-slate-500">Preview first</p>
            </Link>
            <Link to="/vocabulary/learn" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 transition hover:bg-emerald-500/15">
              <FiBookOpen className="text-emerald-500" />
              <p className="mt-4 font-display font-bold text-slate-950 dark:text-white">Learn & manage</p>
              <p className="mt-1 text-xs text-slate-500">{data.counts?.total || 0} entries</p>
            </Link>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">CDS ENGLISH PRACTICE</p>
            <h2 className="mt-1 font-display text-2xl font-black text-slate-950 dark:text-white">
              Exam-style vocabulary drills
            </h2>
          </div>
          <PracticeModePicker
            cdsModes={CDS_EXAM_MODES}
            legacyModes={ARENA_LEGACY_MODES}
            onSelect={(mode) => navigate(`/vocabulary/practice?mode=${mode.id}`)}
          />
        </section>
      </div>
    </Layout>
  );
};

export default VocabularyDashboardPage;
