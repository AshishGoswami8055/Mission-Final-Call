import { useState } from "react";
import { FiChevronDown } from "react-icons/fi";

/**
 * Collapsible section on mobile only; always expanded on md+.
 */
const MobileCollapsibleSection = ({
  title,
  subtitle = "",
  badge = "",
  defaultOpen = false,
  isDark = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`overflow-hidden rounded-xl border md:rounded-2xl ${
        isDark ? "border-neutral-800 bg-neutral-950" : "border-slate-200 bg-white"
      }`}
    >
      <button
        type="button"
        className={`flex w-full items-center gap-3 px-3 py-3 text-left md:hidden ${
          isDark ? "text-slate-100" : "text-slate-900"
        }`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {badge ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {badge}
              </span>
            ) : null}
          </span>
          {subtitle ? (
            <span className={`mt-0.5 block truncate text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {subtitle}
            </span>
          ) : null}
        </span>
        <FiChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className="hidden border-b border-slate-100 px-4 pb-2 pt-3 dark:border-white/10 md:block md:border-0 md:px-4 md:pt-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? (
          <p className={`mt-0.5 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{subtitle}</p>
        ) : null}
      </div>

      <div className={`px-3 pb-3 md:px-4 md:pb-4 ${open ? "block" : "hidden md:block"}`}>{children}</div>
    </section>
  );
};

export default MobileCollapsibleSection;
