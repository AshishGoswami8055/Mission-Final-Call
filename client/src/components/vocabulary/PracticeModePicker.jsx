import { FiArrowUpRight } from "react-icons/fi";
import { VOCABULARY_MODES } from "../../utils/vocabularyArena";

const PracticeModePicker = ({ onSelect, compact = false, modes = VOCABULARY_MODES }) => (
  <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
    {modes.map((mode) => {
      const Icon = mode.icon;
      return (
        <button
          key={mode.id}
          type="button"
          onClick={() => onSelect(mode)}
          className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left transition duration-300 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-xl dark:border-white/[0.07] dark:bg-[#151515] dark:hover:border-white/20"
        >
          <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${mode.accent} text-white shadow-lg`}>
            <Icon size={20} />
          </div>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-950 dark:text-white">{mode.title}</h3>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{mode.description}</p>
            </div>
            <FiArrowUpRight className="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-900 dark:group-hover:text-white" />
          </div>
        </button>
      );
    })}
  </div>
);

export default PracticeModePicker;
