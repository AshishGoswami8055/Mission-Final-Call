import { Link } from "react-router-dom";
import { FiCalendar, FiCheckCircle, FiClock, FiPlay } from "react-icons/fi";

/**
 * Single compact card for mobile dashboard — replaces stacked stat cards + study + exam widgets.
 */
const MobileDashboardGlance = ({
  todayMinutes,
  targetMinutes,
  completionPercent,
  totalVideos,
  totalItems,
  daysLeft,
}) => {
  const formatStudy = (m) => {
    const mins = Math.floor(m);
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m`;
  };

  const studyPct = targetMinutes > 0 ? Math.min(100, Math.round((todayMinutes / targetMinutes) * 100)) : 0;

  return (
    <section className="mobile-glance md:hidden">
      <div className="mobile-glance__hero">
        <div className="mobile-glance__stat">
          <span className="mobile-glance__icon mobile-glance__icon--study">
            <FiClock size={16} />
          </span>
          <div className="min-w-0">
            <p className="mobile-glance__label">Today</p>
            <p className="mobile-glance__value">
              {formatStudy(todayMinutes)}
              <span className="mobile-glance__muted"> / {formatStudy(targetMinutes)}</span>
            </p>
          </div>
        </div>
        <div className="mobile-glance__divider" aria-hidden />
        <div className="mobile-glance__stat">
          <span className="mobile-glance__icon mobile-glance__icon--exam">
            <FiCalendar size={16} />
          </span>
          <div className="min-w-0">
            <p className="mobile-glance__label">Exam in</p>
            <p className="mobile-glance__value tabular-nums">{Math.max(0, daysLeft)}d</p>
          </div>
        </div>
      </div>

      <div className="mobile-glance__progress">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span>Daily study</span>
          <span className="tabular-nums">{studyPct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-slate-900 transition-all dark:bg-white"
            style={{ width: `${studyPct}%` }}
          />
        </div>
      </div>

      <div className="mobile-glance__chips">
        <span className="mobile-glance__chip">
          <FiPlay size={12} />
          {totalVideos} videos
        </span>
        <span className="mobile-glance__chip">
          <FiCheckCircle size={12} />
          {completionPercent}% done
        </span>
        <span className="mobile-glance__chip tabular-nums">{totalItems} items</span>
      </div>

      <Link to="/mission" className="mobile-glance__cta">
        Open today&apos;s target →
      </Link>
    </section>
  );
};

export default MobileDashboardGlance;
