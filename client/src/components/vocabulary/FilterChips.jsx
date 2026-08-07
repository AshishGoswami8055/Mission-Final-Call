const FilterChips = ({ value, options = [], onChange }) => (
  <div className="flex gap-2 overflow-x-auto pb-1">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${
          value === option.value
            ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.07] dark:text-slate-300 dark:hover:bg-white/10"
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export default FilterChips;
