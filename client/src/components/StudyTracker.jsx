import { useState } from "react";
import { FiClock, FiTarget } from "react-icons/fi";
import { Link } from "react-router-dom";
import { useStudy } from "../context/StudyContext";
import StudyTargetModal from "./StudyTargetModal";

const formatMinutes = (m) => {
  const mins = Math.floor(m);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins} min`;
};

const shell =
  "rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-[#1a1a1a]";

const StudyTracker = ({ compact = false, subjects = [], showHistoryLink = true }) => {
  const {
    todayMinutes,
    todayMinutesBySubject,
    targetMinutes,
    targetBySubject,
    setAllTargets,
  } = useStudy();
  const [showTargetModal, setShowTargetModal] = useState(false);

  const totalProgress = targetMinutes > 0 ? Math.min(100, (todayMinutes / targetMinutes) * 100) : 0;
  const totalComplete = targetMinutes > 0 && todayMinutes >= targetMinutes;

  const subjectIdsWithTargetOrTime = new Set([
    ...Object.keys(targetBySubject).filter((id) => (targetBySubject[id] || 0) > 0),
    ...Object.keys(todayMinutesBySubject).filter((id) => (todayMinutesBySubject[id] || 0) > 0),
  ]);
  const fromSubjects = subjects.filter((s) => subjectIdsWithTargetOrTime.has(s._id));
  const orphanIds = Array.from(subjectIdsWithTargetOrTime).filter(
    (id) => !subjects.some((s) => s._id === id)
  );
  const subjectRows = [
    ...fromSubjects,
    ...orphanIds.map((id) => ({ _id: id, name: "Subject" })),
  ];
  const hasSubjectTargetsOrTime = subjectRows.length > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {showHistoryLink && (
          <Link
            to="/history"
            className="rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white"
          >
            History
          </Link>
        )}
        <button
          type="button"
          onClick={() => setShowTargetModal(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium tabular-nums text-slate-700 transition-colors hover:border-slate-300 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-slate-200 dark:hover:border-white/20"
          title="Today's study time & target"
        >
          <FiClock className="text-slate-500 dark:text-slate-400" size={14} strokeWidth={2} />
          {formatMinutes(todayMinutes)}
          <span className="text-slate-300 dark:text-slate-600">/</span>
          {formatMinutes(targetMinutes)}
        </button>
        {showTargetModal && (
          <StudyTargetModal
            subjects={subjects}
            currentTarget={targetMinutes}
            subjectTargets={targetBySubject}
            onClose={() => setShowTargetModal(false)}
            onSave={(total, bySubject) => {
              setAllTargets(total, bySubject);
              setShowTargetModal(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
            <FiClock size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Today
            </p>
            <p className="mt-1.5 text-[1.65rem] font-semibold leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-50 sm:text-3xl">
              {formatMinutes(todayMinutes)}
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Target {formatMinutes(targetMinutes)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-5 border-t border-slate-100 pt-4 text-xs font-medium text-slate-500 dark:border-white/10 dark:text-slate-400 sm:border-t-0 sm:pt-0">
          <button
            type="button"
            onClick={() => setShowTargetModal(true)}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-900 dark:hover:text-white"
          >
            <FiTarget size={14} strokeWidth={2} />
            Targets
          </button>
          <Link
            to="/history"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-900 dark:hover:text-white"
          >
            History
          </Link>
        </div>
      </div>

      {targetMinutes > 0 && (
        <div className="mt-6">
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                totalComplete ? "bg-emerald-600 dark:bg-emerald-500" : "bg-slate-900 dark:bg-slate-200"
              }`}
              style={{ width: `${totalProgress}%` }}
            />
          </div>
          <p className="mt-2.5 text-xs text-slate-400 dark:text-slate-500">
            {totalComplete ? (
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                Daily target met
              </span>
            ) : (
              `${Math.round(totalProgress)}% of daily target`
            )}
          </p>
        </div>
      )}

      {hasSubjectTargetsOrTime && subjectRows.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/10">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            By subject
          </p>
          <div className="space-y-3">
            {subjectRows.slice(0, 3).map((subject) => {
              const subId = subject._id;
              const target = targetBySubject[subId] || 0;
              const studied = todayMinutesBySubject[subId] || 0;
              if (target === 0 && studied === 0) return null;
              const progress = target > 0 ? Math.min(100, (studied / target) * 100) : 0;
              const done = target > 0 && studied >= target;
              const name = subject.name || "Subject";
              return (
                <div key={subId} className="flex items-center gap-3">
                  <span className="w-22 shrink-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                    {name}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div
                        className={`h-full rounded-full ${done ? "bg-emerald-600 dark:bg-emerald-500" : "bg-slate-800 dark:bg-slate-300"}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
                    {formatMinutes(studied)}/{formatMinutes(target)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showTargetModal && (
        <StudyTargetModal
          subjects={subjects}
          currentTarget={targetMinutes}
          subjectTargets={targetBySubject}
          onClose={() => setShowTargetModal(false)}
          onSave={(total, bySubject) => {
            setAllTargets(total, bySubject);
            setShowTargetModal(false);
          }}
        />
      )}
    </div>
  );
};

export default StudyTracker;
