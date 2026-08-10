import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowRight, FiClock, FiFileText, FiShield } from "react-icons/fi";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import Layout from "../components/Layout";
import PracticeModePicker from "../components/vocabulary/PracticeModePicker";
import VocabularyHeader from "../components/vocabulary/VocabularyHeader";
import {
  ARENA_LEGACY_MODES,
  CDS_EXAM_MODES,
  QUESTION_COUNT_OPTIONS,
  VOCABULARY_MODES,
  isCdsExamMode,
  isTimedMode,
  sessionDurationSeconds,
} from "../utils/vocabularyArena";

const VocabularyPracticePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") || "cds_pyq";
  const [mode, setMode] = useState(
    VOCABULARY_MODES.some((item) => item.id === initialMode) ? initialMode : "cds_pyq"
  );
  const [questionCount, setQuestionCount] = useState(10);
  const [type, setType] = useState("all");
  const [starting, setStarting] = useState(false);
  const selectedMode = useMemo(() => VOCABULARY_MODES.find((item) => item.id === mode), [mode]);

  const start = async () => {
    setStarting(true);
    try {
      const timed = isTimedMode(mode);
      const response = await api.post("/vocabulary/session/start", {
        mode,
        type,
        questionCount,
        timed,
        examMode: isCdsExamMode(mode) || mode === "exam",
        durationSeconds: sessionDurationSeconds(mode, questionCount),
        preferAi: true,
      });
      const source = response.data.session?.pyqSource;
      if (isCdsExamMode(mode)) {
        toast.success(
          source === "ai"
            ? "Fresh AI paper generated — new questions this session."
            : "Using offline CDS templates (check OPENAI_API_KEY if you expected AI).",
          { duration: 4000 }
        );
      }
      navigate(`/vocabulary/session/${response.data.session.sessionId}`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not start practice.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Layout title="CDS English Practice">
      <div className="space-y-5">
        <VocabularyHeader
          backTo="/vocabulary"
          title="CDS English Practice"
          subtitle="Choose an exam-style format modeled on CDS 1 2026 English — not generic flashcard drills."
          actions={false}
        />
        <PracticeModePicker
          selectedId={mode}
          cdsModes={CDS_EXAM_MODES}
          legacyModes={ARENA_LEGACY_MODES}
          onSelect={(selected) => setMode(selected.id)}
        />
        <section className="sticky bottom-3 z-20 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-white/[0.1] dark:bg-[#111]/95 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">Selected mode</p>
              <p className="mt-1 font-display text-xl font-black text-slate-950 dark:text-white">
                {selectedMode?.title}
              </p>
            </div>
            <label className="text-xs font-bold text-slate-500">
              Word bank
              <select className="input mt-1 min-w-40" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="all">All CDS English</option>
                <option value="vocabulary">Vocabulary</option>
                <option value="idiom">Idioms</option>
                <option value="one_word">One-word substitution</option>
              </select>
            </label>
            <div>
              <p className="text-xs font-bold text-slate-500">Questions</p>
              <div className="mt-1 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.07]">
                {QUESTION_COUNT_OPTIONS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setQuestionCount(count)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${
                      questionCount === count
                        ? "bg-white text-slate-950 shadow dark:bg-slate-100"
                        : "text-slate-500"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn-primary min-h-12 px-6" disabled={starting} onClick={start}>
              {isCdsExamMode(mode) ? <FiFileText /> : mode === "exam" ? <FiShield /> : <FiClock />}
              {starting
                ? isCdsExamMode(mode)
                  ? "Generating paper…"
                  : "Preparing…"
                : "Start paper"}{" "}
              <FiArrowRight />
            </button>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default VocabularyPracticePage;
