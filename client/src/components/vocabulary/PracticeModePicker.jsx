import { FiArrowUpRight } from "react-icons/fi";

const ModeCard = ({ mode, selected, onSelect }) => {
  const Icon = mode.icon;
  const active = selected === mode.id;
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
        active
          ? "border-amber-600 bg-amber-50/80 ring-2 ring-amber-500/30 dark:border-amber-400/40 dark:bg-amber-950/20"
          : "border-slate-200 bg-white hover:border-slate-400 dark:border-white/[0.07] dark:bg-[#151515] dark:hover:border-white/20"
      }`}
    >
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${mode.accent} text-white shadow-lg`}>
        <Icon size={20} />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-slate-950 dark:text-white">{mode.title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{mode.description}</p>
        </div>
        <FiArrowUpRight
          className={`mt-1 shrink-0 transition ${
            active
              ? "text-amber-700 dark:text-amber-300"
              : "text-slate-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-900 dark:group-hover:text-white"
          }`}
        />
      </div>
    </button>
  );
};

const PracticeModePicker = ({
  onSelect,
  selectedId = "",
  cdsModes = [],
  legacyModes = [],
}) => (
  <div className="space-y-6">
    <section>
      <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-amber-800 dark:text-amber-300">
        CDS English — Exam Practice
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cdsModes.map((mode) => (
          <ModeCard key={mode.id} mode={mode} selected={selectedId} onSelect={onSelect} />
        ))}
      </div>
    </section>
    {legacyModes.length ? (
      <section>
        <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
          SRS & Recall Training
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {legacyModes.map((mode) => (
            <ModeCard key={mode.id} mode={mode} selected={selectedId} onSelect={onSelect} />
          ))}
        </div>
      </section>
    ) : null}
  </div>
);

export default PracticeModePicker;
