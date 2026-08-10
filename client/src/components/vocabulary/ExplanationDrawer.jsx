import { FiBook, FiCheckCircle, FiGitBranch, FiTag } from "react-icons/fi";
import MnemonicCard from "./MnemonicCard";

const TokenList = ({ label, values = [], tone }) => {
  if (!values.length) return null;
  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={`${label}-${value}`} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tone}`}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
};

const ExplanationDrawer = ({ feedback }) => {
  if (!feedback) return null;
  const explanation = feedback.explanation || {};
  const correct = feedback.correct !== false;
  return (
    <section className={`overflow-hidden rounded-3xl border ${
      correct
        ? "border-emerald-500/30 bg-emerald-500/[0.06]"
        : "border-rose-500/30 bg-rose-500/[0.06]"
    }`}>
      <div className="border-b border-current/10 p-5 sm:p-6">
        <p className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] ${
          correct ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
        }`}>
          <FiCheckCircle /> {correct ? "Correct — memory strengthened" : "Correction logged — review advanced"}
        </p>
        <h2 className="mt-2 font-display text-2xl font-black text-slate-950 dark:text-white">
          {feedback.correctAnswer || explanation.word}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
          {explanation.rationale ? (
            <>
              <span className="font-semibold">Why: </span>
              {explanation.rationale}
            </>
          ) : (
            explanation.meaning
          )}
        </p>
      </div>
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <TokenList label="Synonyms" values={explanation.synonyms} tone="bg-sky-500/10 text-sky-700 dark:text-sky-300" />
          <TokenList label="Antonyms" values={explanation.antonyms} tone="bg-rose-500/10 text-rose-700 dark:text-rose-300" />
          {explanation.example ? (
            <div className="rounded-2xl bg-white/70 p-4 dark:bg-black/20">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
                <FiBook /> Usage
              </p>
              <p className="mt-2 text-sm italic leading-6 text-slate-700 dark:text-slate-200">
                “{explanation.example}”
              </p>
            </div>
          ) : null}
        </div>
        <div className="space-y-4">
          <MnemonicCard mnemonic={explanation.mnemonic} />
          {explanation.rootWord ? (
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">
                <FiGitBranch /> Root breakdown
              </p>
              <p className="mt-2 text-sm text-violet-950 dark:text-violet-100">
                <strong>{explanation.rootWord}</strong>
                {explanation.rootMeaning ? ` — ${explanation.rootMeaning}` : ""}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {explanation.partOfSpeech ? <span className="rounded-lg bg-slate-500/10 px-2.5 py-1">{explanation.partOfSpeech}</span> : null}
            {(explanation.tags || []).map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-slate-500/10 px-2.5 py-1"><FiTag /> {tag}</span>
            ))}
          </div>
          {Object.keys(explanation.optionNotes || {}).length ? (
            <div className="rounded-2xl bg-white/70 p-4 dark:bg-black/20">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Option audit</p>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {Object.entries(explanation.optionNotes).map(([option, note]) => (
                  <li key={option}><strong>{option}:</strong> {note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {feedback.nextIntervalDays ? (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Review outcome</p>
              <div className="mt-2 flex gap-2">
                {["again", "good", "easy"].map((result) => (
                  <span key={result} className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${
                    feedback.result === result
                      ? result === "again"
                        ? "bg-rose-500 text-white"
                        : result === "easy"
                          ? "bg-emerald-500 text-white"
                          : "bg-amber-500 text-white"
                      : "bg-slate-500/10 text-slate-400"
                  }`}>{result}</span>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Next review in {feedback.nextIntervalDays} day{feedback.nextIntervalDays === 1 ? "" : "s"} · Confidence {feedback.confidence || 0}%
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default ExplanationDrawer;
