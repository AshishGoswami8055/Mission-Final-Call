import {
  FiClock,
  FiCrosshair,
  FiFileText,
  FiGrid,
  FiMenu,
} from "react-icons/fi";
import { Link, useLocation } from "react-router-dom";

const TABS = [
  {
    to: "/",
    label: "Home",
    icon: FiGrid,
    match: (path) => path === "/",
  },
  {
    to: "/mission",
    label: "Target",
    icon: FiCrosshair,
    match: (path) => path.startsWith("/mission"),
  },
  {
    to: "/papers",
    label: "Papers",
    icon: FiFileText,
    match: (path) => path.startsWith("/papers") || path.startsWith("/paper/"),
  },
  {
    to: "/history",
    label: "History",
    icon: FiClock,
    match: (path) => path.startsWith("/history"),
  },
];

const MobileBottomNav = ({ onOpenMenu }) => {
  const location = useLocation();

  return (
    <nav
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/90 bg-white/95 backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-[#0a0a0a]/95"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(location.pathname);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`mobile-bottom-nav__item flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                active
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                  active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-current"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.25 : 2} />
              </span>
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="mobile-bottom-nav__item flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold text-slate-500 transition-colors dark:text-slate-400"
          aria-label="Open menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl">
            <FiMenu size={18} />
          </span>
          <span className="truncate">Menu</span>
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
