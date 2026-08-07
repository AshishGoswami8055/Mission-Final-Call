import { FiArrowRight, FiGitBranch } from "react-icons/fi";

const RootWordFamilyCard = ({ family, onPractice }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-[#151515]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
          <FiGitBranch /> Root family
        </p>
        <h3 className="mt-2 font-display text-2xl font-black text-slate-950 dark:text-white">{family.rootWord}</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{family.rootMeaning || "Meaning not added yet"}</p>
      </div>
      {family.weakCount ? <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-500">{family.weakCount} weak</span> : null}
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {family.words.slice(0, 8).map((word) => (
        <span key={word._id} title={word.meaning} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:bg-white/[0.07] dark:text-slate-200">
          {word.word}
        </span>
      ))}
      {family.words.length > 8 ? <span className="px-2 py-1.5 text-xs text-slate-400">+{family.words.length - 8}</span> : null}
    </div>
    <button type="button" className="btn-secondary mt-5 w-full" onClick={() => onPractice(family)}>
      Practice this family <FiArrowRight />
    </button>
  </article>
);

export default RootWordFamilyCard;
