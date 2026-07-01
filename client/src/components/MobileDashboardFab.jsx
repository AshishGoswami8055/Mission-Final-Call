import { useEffect, useRef, useState } from "react";
import { FiPlus, FiUploadCloud, FiX } from "react-icons/fi";

const MobileDashboardFab = ({ onAddContent, onImportTelegram, importDisabled }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="mobile-fab md:hidden">
      {open && (
        <div className="mobile-fab__menu anim-scale-in">
          <button
            type="button"
            className="mobile-fab__menu-item"
            disabled={importDisabled}
            onClick={() => {
              setOpen(false);
              onImportTelegram?.();
            }}
          >
            <FiUploadCloud size={18} />
            Import Telegram
          </button>
          <button
            type="button"
            className="mobile-fab__menu-item mobile-fab__menu-item--primary"
            onClick={() => {
              setOpen(false);
              onAddContent?.();
            }}
          >
            <FiPlus size={18} />
            Add content
          </button>
        </div>
      )}
      <button
        type="button"
        className={`mobile-fab__trigger ${open ? "mobile-fab__trigger--open" : ""}`}
        aria-label={open ? "Close actions" : "Add content"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <FiX size={22} /> : <FiPlus size={22} />}
      </button>
    </div>
  );
};

export default MobileDashboardFab;
