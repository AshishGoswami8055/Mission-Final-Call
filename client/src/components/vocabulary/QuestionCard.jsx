import { FiClock, FiSkipForward } from "react-icons/fi";
import OptionGrid from "./OptionGrid";
import RevealPanel from "./RevealPanel";
import TypedAnswerBox from "./TypedAnswerBox";

const QuestionCard = ({
  question,
  selected,
  typedAnswer,
  revealed,
  submitting,
  secondsLeft,
  onSelect,
  onTypedChange,
  onSubmit,
  onReveal,
  onRate,
  onSkip,
}) => (
  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 dark:border-white/[0.08] dark:bg-[#111] dark:shadow-black/30 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-lg bg-indigo-500/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
          {question.questionType.replace(/_/g, " ")}
        </span>
        <span className="rounded-lg bg-slate-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {question.difficulty}
        </span>
      </div>
      {secondsLeft != null ? (
        <span className={`inline-flex items-center gap-2 font-mono text-sm font-bold ${
          secondsLeft <= 30 ? "text-rose-500" : "text-slate-500"
        }`}>
          <FiClock /> {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
        </span>
      ) : null}
    </div>
    <h2 className="mt-6 max-w-4xl font-display text-2xl font-black leading-tight text-slate-950 dark:text-white sm:text-3xl">
      {question.prompt}
    </h2>
    <div className="mt-7">
      {question.interaction === "mcq" ? (
        <OptionGrid options={question.options} selected={selected} disabled={submitting} onSelect={onSelect} />
      ) : question.interaction === "typing" ? (
        <TypedAnswerBox value={typedAnswer} disabled={submitting} onChange={onTypedChange} onSubmit={onSubmit} />
      ) : (
        <RevealPanel revealed={revealed} disabled={submitting} onReveal={onReveal} onRate={onRate} />
      )}
    </div>
    {question.interaction === "mcq" ? (
      <div className="mt-5 flex flex-wrap justify-between gap-3">
        <button type="button" className="btn-ghost" onClick={onSkip} disabled={submitting}>
          <FiSkipForward /> Skip
        </button>
        <button type="button" className="btn-primary min-w-32" onClick={onSubmit} disabled={!selected || submitting}>
          {submitting ? "Checking…" : "Check answer"}
        </button>
      </div>
    ) : null}
  </section>
);

export default QuestionCard;
