import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { useTheme } from "../context/ThemeContext";

/**
 * Slide-in side drawer that hosts the dark primary-nav sidebar on small
 * screens. The drawer itself renders no chrome — the dark Sidebar component
 * fills the full panel so the visual is consistent with the desktop sidebar.
 */
const MobileNav = ({ open, onClose, children }) => {
  const { theme } = useTheme();
  const lightRail = theme === "dark";

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const node = (
    <div className="fixed inset-0 z-60 lg:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close menu"
        className="anim-fade-in absolute inset-0 bg-slate-950/55 backdrop-blur-md"
        onClick={onClose}
      />
      <aside className="anim-slide-in-left absolute left-0 top-0 flex h-full w-[88%] max-w-72 flex-col overflow-hidden shadow-2xl">
        <button
          type="button"
          className={`absolute right-3 top-3 z-10 rounded-lg p-2 transition-colors ${
            lightRail
              ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              : "text-slate-400 hover:bg-white/10 hover:text-white"
          }`}
          onClick={onClose}
          aria-label="Close menu"
        >
          <FiX size={18} />
        </button>
        {children}
      </aside>
    </div>
  );

  return createPortal(node, document.body);
};

export default MobileNav;
