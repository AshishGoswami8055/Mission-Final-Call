import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowRight } from "react-icons/fi";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import ExplanationDrawer from "../components/vocabulary/ExplanationDrawer";
import QuestionCard from "../components/vocabulary/QuestionCard";
import SessionSummary from "../components/vocabulary/SessionSummary";
import useVocabularySession from "../hooks/useVocabularySession";
import { formatPracticeMode } from "../utils/vocabularyArena";

const VocabularySessionPage = () => {
  const { sessionId } = useParams();
  const arena = useVocabularySession(sessionId);
  const [selected, setSelected] = useState("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (!arena.session?.timed || !arena.session?.durationSeconds) return undefined;
    const elapsed = Math.floor((Date.now() - new Date(arena.session.startedAt).getTime()) / 1000);
    const timer = window.setTimeout(
      () => setSecondsLeft(Math.max(0, arena.session.durationSeconds - elapsed)),
      0
    );
    return () => window.clearTimeout(timer);
  }, [arena.session?.durationSeconds, arena.session?.startedAt, arena.session?.timed]);

  useEffect(() => {
    if (secondsLeft == null || showSummary) return undefined;
    if (secondsLeft <= 0) {
      void arena.finish().then(() => setShowSummary(true)).catch(() => undefined);
      return undefined;
    }
    const timer = window.setTimeout(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [arena, secondsLeft, showSummary]);

  const progress = useMemo(() => {
    if (!arena.session?.totalQuestions) return 0;
    return Math.round(((arena.session.answeredQuestions || 0) / arena.session.totalQuestions) * 100);
  }, [arena.session]);

  const submit = useCallback(async (answerValue = null, result = null, skipped = false) => {
    if (!arena.question) return;
    const answer =
      answerValue ??
      (arena.question.interaction === "typing" ? typedAnswer : selected);
    try {
      await arena.answer({ answer, result, skipped });
    } catch {
      // Hook exposes the API message.
    }
  }, [arena, selected, typedAnswer]);

  const nextQuestion = useCallback(async () => {
    if (!arena.feedback?.nextQuestion) {
      if (arena.feedback?.session?.weakCategories || arena.session?.weakCategories) {
        setShowSummary(true);
        return;
      }
      try {
        await arena.finish();
        setShowSummary(true);
      } catch {
        toast.error("Could not finish the drill.");
      }
      return;
    }
    arena.next();
    setSelected("");
    setTypedAnswer("");
  }, [arena]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (!arena.question || showSummary) return;
      if (!typing && arena.question.interaction === "mcq" && /^[1-4]$/.test(event.key)) {
        setSelected(arena.question.options[Number(event.key) - 1] || "");
      }
      if (!typing && event.code === "Space" && arena.question.interaction === "reveal" && !arena.feedback) {
        event.preventDefault();
        void arena.reveal();
      }
      if (!typing && event.key.toLowerCase() === "n" && arena.feedback?.correctAnswer) {
        void nextQuestion();
      }
      if (!typing && event.key.toLowerCase() === "r" && arena.feedback?.revealed) {
        void submit(arena.feedback.correctAnswer, "again");
      }
      if (event.key === "Enter" && !arena.feedback && (selected || typedAnswer)) {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [arena, nextQuestion, selected, showSummary, submit, typedAnswer]);

  if (arena.loading) {
    return <Layout title="Vocabulary Session"><div className="flex min-h-[65vh] items-center justify-center"><Loader label="Loading questions…" /></div></Layout>;
  }
  if (arena.error && !arena.session) {
    return <Layout title="Vocabulary Session"><p className="rounded-xl bg-rose-500/10 p-5 text-rose-500">{arena.error}</p></Layout>;
  }
  if (showSummary || (arena.session?.status === "completed" && !arena.question && !arena.feedback)) {
    return <Layout title="Session complete"><SessionSummary session={arena.session} /></Layout>;
  }

  const actualFeedback = arena.feedback?.correctAnswer && !arena.feedback?.revealed ? arena.feedback : null;
  return (
    <Layout title={formatPracticeMode(arena.session?.mode)}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/[0.08] dark:bg-[#151515]">
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
            <span>{formatPracticeMode(arena.session?.mode)}</span>
            <span>{arena.session?.answeredQuestions || 0} / {arena.session?.totalQuestions || 0}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {arena.question ? (
          <QuestionCard
            question={arena.question}
            selected={selected}
            typedAnswer={typedAnswer}
            revealed={Boolean(arena.feedback?.revealed)}
            submitting={arena.submitting}
            secondsLeft={secondsLeft}
            onSelect={setSelected}
            onTypedChange={setTypedAnswer}
            onSubmit={() => submit()}
            onReveal={() => arena.reveal()}
            onRate={(result) => submit(arena.feedback?.correctAnswer, result)}
            onSkip={() => submit("", "again", true)}
          />
        ) : null}
        {arena.feedback?.revealed ? (
          <ExplanationDrawer feedback={{ ...arena.feedback, correct: true }} />
        ) : (
          <ExplanationDrawer feedback={actualFeedback} />
        )}
        {actualFeedback ? (
          <button type="button" className="btn-primary ml-auto flex" onClick={nextQuestion}>
            {arena.feedback.nextQuestion ? "Next question" : "View report"} <FiArrowRight />
          </button>
        ) : null}
        {arena.error ? <p className="text-sm text-rose-500">{arena.error}</p> : null}
      </div>
    </Layout>
  );
};

export default VocabularySessionPage;
