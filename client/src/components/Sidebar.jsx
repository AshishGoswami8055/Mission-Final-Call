import {
  FiBookmark,
  FiBookOpen,
  FiClock,
  FiFileText,
  FiGrid,
  FiLogOut,
  FiType,
} from "react-icons/fi";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

/**
 * Primary navigation — matches the high-contrast reference shell:
 *   • Light app theme → dark sidebar (charcoal)
 *   • Dark app theme  → white sidebar (store-style), dark main lives in Layout
 */

const NAV_ITEMS = [
  {
    to: "/",
    label: "Dashboard",
    icon: FiGrid,
    match: (p) => p === "/",
  },
  {
    to: "/papers",
    label: "PYQ Papers",
    icon: FiFileText,
    match: (p) => p.startsWith("/papers") || p.startsWith("/paper/"),
  },
  {
    to: "/vocabulary",
    label: "Vocabulary",
    icon: FiBookOpen,
    match: (p) => p.startsWith("/vocabulary"),
  },
  {
    to: "/idioms",
    label: "Idioms",
    icon: FiBookmark,
    match: (p) => p.startsWith("/idioms"),
  },
  {
    to: "/one-word-substitution",
    label: "One Word",
    icon: FiType,
    match: (p) => p.startsWith("/one-word-substitution"),
  },
  {
    to: "/history",
    label: "Watch History",
    icon: FiClock,
    match: (p) => p.startsWith("/history"),
  },
];

const initialsFor = (name = "Admin") => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const Sidebar = ({ onItemClick }) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const lightRail = theme === "dark";

  return (
    <aside
      className={`flex h-full w-full flex-col ${
        lightRail ? "bg-white text-slate-800" : "bg-[#0a0a0a] text-slate-200"
      }`}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 pb-5 pt-7">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl font-display text-base font-bold shadow-md ${
            lightRail
              ? "bg-slate-900 text-white shadow-black/15"
              : "bg-white text-slate-900 shadow-black/40"
          }`}
        >
          C
        </span>
        <div className="min-w-0">
          <p
            className={`font-display text-lg leading-tight ${
              lightRail ? "text-slate-900" : "text-white"
            }`}
          >
            CDS Journey
          </p>
          <p
            className={`truncate text-[10px] font-medium uppercase tracking-[0.18em] ${
              lightRail ? "text-slate-500" : "text-slate-500"
            }`}
          >
            Study workspace
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-4 pb-5 pt-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.match(location.pathname);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onItemClick}
              className={`group flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-semibold transition-all duration-150 ${
                active
                  ? lightRail
                    ? "bg-slate-900 text-white shadow-md shadow-black/20"
                    : "bg-white text-slate-900 shadow-md shadow-black/30"
                  : lightRail
                    ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon
                size={16}
                className={
                  active
                    ? lightRail
                      ? "text-white"
                      : "text-slate-900"
                    : lightRail
                      ? "text-slate-400 group-hover:text-slate-700"
                      : "text-slate-500 group-hover:text-slate-200"
                }
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User / logout */}
      <div
        className={`border-t px-4 pb-5 pt-4 ${
          lightRail ? "border-slate-200/90" : "border-white/[0.08]"
        }`}
      >
        <div
          className={`flex items-center gap-3.5 rounded-xl p-3 ring-1 ring-inset ${
            lightRail
              ? "bg-slate-100 ring-slate-200/80"
              : "bg-white/[0.04] ring-white/[0.04]"
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-orange-500 to-rose-500 text-xs font-bold text-white shadow-md">
            {initialsFor(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-sm font-semibold ${
                lightRail ? "text-slate-900" : "text-white"
              }`}
            >
              {user?.name || "Admin"}
            </p>
            <p
              className={`truncate text-[11px] ${
                lightRail ? "text-slate-500" : "text-slate-400"
              }`}
            >
              Workspace owner
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className={`mt-2 flex w-full items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${
            lightRail
              ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <FiLogOut size={16} /> Log out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
