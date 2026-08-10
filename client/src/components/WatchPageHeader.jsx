import { useMemo, useState } from "react";
import { FiArrowLeft, FiClock, FiMoon, FiSun, FiTarget, FiTrendingUp } from "react-icons/fi";
import { Link } from "react-router-dom";
import { VIDEO_STREAK_GOAL_MINUTES } from "../constants/streak";
import { useStudy } from "../context/StudyContext";
import FireIcon from "./streak/FireIcon";
import StudyTargetModal from "./StudyTargetModal";

const formatMinutes = (m) => {
  const mins = Math.floor(Number(m) || 0);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m`;
};

const getMotivation = ({
  todayMinutes,
  targetMinutes,
  videoStreak,
  videoStreakTodayComplete,
}) => {
  if (targetMinutes > 0 && todayMinutes >= targetMinutes) {
    const extra = todayMinutes - targetMinutes;
    if (extra >= 30) return "Crushing it — you're stacking bonus reps on top of today's win.";
    if (extra > 0) return "Daily target done. Every extra minute compounds your edge.";
    return "Target hit. Stay sharp — consistency wins the exam.";
  }
  if (targetMinutes > 0) {
    const remaining = targetMinutes - todayMinutes;
    if (remaining <= 10) return `Final push — ${formatMinutes(remaining)} left to complete today's mission.`;
    const pct = Math.round((todayMinutes / targetMinutes) * 100);
    if (pct >= 75) return `${pct}% there. Finish today like you mean selection.`;
    if (pct >= 40) return "Momentum building. One more focused block changes the day.";
  }
  if (videoStreakTodayComplete) {
    return `${videoStreak} day streak secured. Ride the wave.`;
  }
  if (videoStreak > 0) {
    return `${videoStreak} day streak on the line — show up and extend it.`;
  }
  return "Every minute on this page moves you closer to the merit list.";
};

const WatchPageHeader = ({ isDark, onToggleTheme, subjects = [] }) => {
  const [showTargetModal, setShowTargetModal] = useState(false);
  const {
    todayMinutes,
    targetMinutes,
    targetBySubject,
    setAllTargets,
    videoStreak,
    effectiveTodayVideoMinutes,
    videoStreakTodayComplete,
    videoStreakProgressPercent,
  } = useStudy();

  const dailyProgress =
    targetMinutes > 0 ? Math.min(100, Math.round((todayMinutes / targetMinutes) * 100)) : 0;
  const dailyComplete = targetMinutes > 0 && todayMinutes >= targetMinutes;
  const streakActive = videoStreakTodayComplete || videoStreak > 0;

  const motivation = useMemo(
    () =>
      getMotivation({
        todayMinutes,
        targetMinutes,
        videoStreak,
        videoStreakTodayComplete,
      }),
    [todayMinutes, targetMinutes, videoStreak, videoStreakTodayComplete]
  );

  return (
    <>
      <header className={`watch-header ${isDark ? "watch-header--dark" : ""}`}>
        <div className="watch-header__glow" aria-hidden="true" />

        <div className="watch-header__left">
          <Link to="/" className="watch-header__back" aria-label="Back to dashboard">
            <FiArrowLeft size={18} strokeWidth={2.25} />
            <span>Dashboard</span>
          </Link>
        </div>

        <div className="watch-header__center">
          <div className="watch-header__session">
            <span className="watch-header__live-dot" aria-hidden="true" />
            <span className="watch-header__session-label">Focus session</span>
          </div>

          <button
            type="button"
            className="watch-header__mission"
            onClick={() => setShowTargetModal(true)}
            title="Today's study time and target"
          >
            <div className="watch-header__mission-top">
              <span className="watch-header__mission-stat">
                <FiClock size={14} aria-hidden="true" />
                <strong className="tabular-nums">{formatMinutes(todayMinutes)}</strong>
                <span className="watch-header__mission-sep">/</span>
                <span className="tabular-nums">{formatMinutes(targetMinutes)}</span>
              </span>
              <span
                className={`watch-header__mission-badge ${
                  dailyComplete ? "watch-header__mission-badge--done" : ""
                }`}
              >
                {dailyComplete ? (
                  <>
                    <FiTrendingUp size={12} aria-hidden="true" />
                    Goal met
                  </>
                ) : (
                  <>
                    <FiTarget size={12} aria-hidden="true" />
                    {dailyProgress}%
                  </>
                )}
              </span>
            </div>

            <div className="watch-header__mission-bar" aria-hidden="true">
              <span
                className={`watch-header__mission-fill ${
                  dailyComplete ? "watch-header__mission-fill--done" : ""
                }`}
                style={{ width: `${dailyProgress}%` }}
              />
            </div>

            <p className="watch-header__motivation">{motivation}</p>
          </button>
        </div>

        <div className="watch-header__right">
          <Link to="/history" className="watch-header__chip">
            History
          </Link>

          <Link
            to="/mission"
            className={`watch-header__streak ${
              videoStreakTodayComplete ? "watch-header__streak--hot" : ""
            }`}
            title={`${videoStreak} day streak · ${formatMinutes(effectiveTodayVideoMinutes)}/${VIDEO_STREAK_GOAL_MINUTES} min video today`}
          >
            <FireIcon size={22} active={streakActive} />
            <div className="watch-header__streak-text">
              <span className="watch-header__streak-num tabular-nums">{videoStreak}</span>
              <span className="watch-header__streak-label">day streak</span>
            </div>
            {!videoStreakTodayComplete && videoStreakProgressPercent > 0 ? (
              <span className="watch-header__streak-pct tabular-nums">{videoStreakProgressPercent}%</span>
            ) : null}
          </Link>

          <button
            type="button"
            className="watch-header__theme"
            onClick={onToggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? <FiSun size={18} /> : <FiMoon size={18} />}
          </button>
        </div>
      </header>

      {showTargetModal ? (
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
      ) : null}
    </>
  );
};

export default WatchPageHeader;
