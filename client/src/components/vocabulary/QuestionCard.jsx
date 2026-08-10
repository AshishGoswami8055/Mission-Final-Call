import { FiClock, FiSkipForward } from "react-icons/fi";
import CdsPyqBody from "./CdsPyqBody";
import OptionGrid from "./OptionGrid";
import RevealPanel from "./RevealPanel";
import TypedAnswerBox from "./TypedAnswerBox";

const CDS_PYQ_TYPES = new Set([
  "confusable_words",
  "similar_sounding",
  "idiom_meaning",
  "idiom_mcq",
  "antonym_in_context",
  "antonym_context",
  "word_meaning",
  "word_pair",
  "synonym_in_context",
  "synonym_context",
  "match_the_following",
  "match_list",
  "sentence_relationship",
  "one_word_substitution",
  "usage_in_sentences",
]);

const isCdsPyq = (question) =>
  question?.format === "cds_pyq" || CDS_PYQ_TYPES.has(question?.questionType);

const formatTypeLabel = (type = "") =>
  String(type)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const QuestionCard = ({
  question,
  questionNumber = 1,
  totalQuestions = 1,
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
}) => {
  const pyq = isCdsPyq(question);
  return (
    <section
      className={`rounded-3xl border shadow-xl shadow-slate-900/5 sm:p-7 ${
        pyq
          ? "border-amber-900/25 bg-[#f7f3ea] p-0 dark:border-amber-200/10 dark:bg-[#16140f]"
          : "border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-[#111] dark:shadow-black/30"
      }`}
    >
      {pyq ? (
        <header className="border-b border-amber-900/15 px-5 py-4 dark:border-amber-200/10 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-900 dark:text-amber-200">
                CDS English
              </p>
              <p className="mt-1 font-serif text-sm font-semibold text-slate-700 dark:text-slate-300">
                Question {String(questionNumber).padStart(2, "0")} / {String(totalQuestions).padStart(2, "0")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-amber-800/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                {formatTypeLabel(question.questionType)}
              </span>
              {question.sourceType === "ai_generated_cds_style" ? (
                <span className="rounded-md bg-slate-500/10 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">
                  AI — CDS style
                </span>
              ) : null}
              {secondsLeft != null ? (
                <span
                  className={`inline-flex items-center gap-2 font-mono text-sm font-bold ${
                    secondsLeft <= 30 ? "text-rose-500" : "text-slate-500"
                  }`}
                >
                  <FiClock /> {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </span>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      <div className={pyq ? "p-5 sm:p-7" : ""}>
        {!pyq ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg bg-indigo-500/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                {formatTypeLabel(question.questionType)}
              </span>
              <span className="rounded-lg bg-slate-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {question.difficulty}
              </span>
            </div>
            {secondsLeft != null ? (
              <span
                className={`inline-flex items-center gap-2 font-mono text-sm font-bold ${
                  secondsLeft <= 30 ? "text-rose-500" : "text-slate-500"
                }`}
              >
                <FiClock /> {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </span>
            ) : null}
          </div>
        ) : null}

        {pyq && question.directions ? (
          <p className="mt-1 border-l-2 border-amber-800/40 pl-3 font-serif text-sm leading-6 text-slate-700 dark:text-slate-300">
            <span className="font-bold">Directions:</span>{" "}
            {String(question.directions).replace(/^Directions:\s*/i, "")}
          </p>
        ) : null}

        {pyq ? (
          <CdsPyqBody question={question} />
        ) : (
          <h2 className="mt-6 max-w-4xl font-display text-2xl font-black leading-tight text-slate-950 dark:text-white sm:text-3xl">
            {question.prompt}
          </h2>
        )}

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
              {submitting ? "Checking…" : "Submit answer"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default QuestionCard;
