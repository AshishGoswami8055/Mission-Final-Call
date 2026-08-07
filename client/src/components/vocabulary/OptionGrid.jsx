const optionLetter = (index) => String.fromCharCode(65 + index);

const OptionGrid = ({ options = [], selected = "", disabled = false, onSelect }) => (
  <div className="grid gap-3 md:grid-cols-2">
    {options.map((option, index) => {
      const active = selected === option;
      return (
        <button
          key={`${index}-${option}`}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option)}
          className={`flex min-h-20 items-start gap-3 rounded-2xl border p-4 text-left text-sm font-medium leading-6 transition ${
            active
              ? "border-indigo-500 bg-indigo-500/10 text-indigo-950 ring-2 ring-indigo-500/20 dark:text-indigo-100"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-[#181818] dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-[#202020]"
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
            active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"
          }`}>
            {optionLetter(index)}
          </span>
          <span>{option}</span>
        </button>
      );
    })}
  </div>
);

export default OptionGrid;
