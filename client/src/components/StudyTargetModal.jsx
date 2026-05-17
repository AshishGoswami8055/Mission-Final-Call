import { useState } from "react";
import { FiTarget } from "react-icons/fi";

const StudyTargetModal = ({ subjects = [], currentTarget, subjectTargets = {}, onClose, onSave }) => {
  const [totalValue, setTotalValue] = useState(String(currentTarget || 60));
  const [bySubject, setBySubject] = useState(() => {
    const init = {};
    subjects.forEach((s) => {
      init[s._id] = String(subjectTargets[s._id] ?? 0);
    });
    return init;
  });

  const handleSave = () => {
    const total = Math.max(0, Math.floor(Number(totalValue)) || 0);
    const subjectMins = {};
    subjects.forEach((s) => {
      const v = Math.max(0, Math.floor(Number(bySubject[s._id])) || 0);
      if (v > 0) subjectMins[s._id] = v;
    });
    onSave(total, subjectMins);
  };

  const updateSubject = (subjectId, value) => {
    setBySubject((prev) => ({ ...prev, [subjectId]: value }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md">
            <FiTarget size={18} />
          </span>
          Set daily study targets
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Set a total target and optional targets per subject to track performance.
        </p>

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total (all subjects)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="600"
              className="input w-24"
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value)}
              placeholder="60"
            />
            <span className="text-sm text-slate-500">min/day</span>
          </div>
        </div>

        {subjects.length > 0 && (
          <div className="mt-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Per subject (optional)
            </label>
            <div className="mt-2 space-y-2">
              {subjects.map((subject) => (
                <div key={subject._id} className="flex items-center gap-2">
                  <span className="min-w-[100px] text-sm font-medium text-slate-700 dark:text-slate-200">
                    {subject.name}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="600"
                    className="input w-20"
                    value={bySubject[subject._id] ?? ""}
                    onChange={(e) => updateSubject(subject._id, e.target.value)}
                    placeholder="0"
                  />
                  <span className="text-xs text-slate-500">min</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            Save targets
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudyTargetModal;
