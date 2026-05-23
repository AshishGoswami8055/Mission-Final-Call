import { FiBell, FiMenu, FiMoon, FiSearch, FiSun } from "react-icons/fi";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const initialsFor = (name = "Admin") => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Reference-matching topbar:
 *   [hamburger (mobile)]  [centered search]   [theme] [bell] [user card]
 *
 * The page title now lives inside the main content area (rendered by
 * Layout) so the topbar stays slim and consistent across every page.
 */
const Topbar = ({
  onOpenMobileNav,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search…",
  showSearch = true,
  notificationsHref = "/history",
}) => {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200/80 bg-white px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3 dark:border-white/[0.08] dark:bg-[#0a0a0a]/90">
      <button
        type="button"
        className="btn-ghost p-2! lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open menu"
      >
        <FiMenu size={20} />
      </button>

      {showSearch ? (
        <div className="relative min-w-0 max-w-md flex-1">
          <FiSearch
            className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            size={15}
          />
          <input
            type="search"
            className="input pl-10! py-2! dark:border-white/10 dark:bg-[#141414] dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-white/15 dark:focus:border-blue-400/80"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          className="btn-ghost p-2.5!"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
        </button>

        <Link
          to={notificationsHref}
          className="btn-ghost relative p-2.5!"
          aria-label="Notifications"
          title="Watch history"
        >
          <FiBell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0a0a0a]" />
        </Link>

        <div className="hidden items-center gap-2.5 pl-1.5 sm:flex">
          <div className="text-right leading-tight">
            <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              {user?.name || "Admin"}
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              Workspace owner
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-orange-500 to-rose-500 text-xs font-bold text-white shadow-md">
            {initialsFor(user?.name)}
          </span>
        </div>

        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-orange-500 to-rose-500 text-xs font-bold text-white shadow-md sm:hidden"
          title={user?.name || "Admin"}
        >
          {initialsFor(user?.name)}
        </span>
      </div>
    </header>
  );
};

export default Topbar;
