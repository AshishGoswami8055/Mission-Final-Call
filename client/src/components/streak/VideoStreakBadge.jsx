import { Link } from "react-router-dom";
import { useStudy } from "../../context/StudyContext";
import { VIDEO_STREAK_GOAL_MINUTES } from "../../constants/streak";
import FireIcon from "./FireIcon";

const formatMinutes = (mins) => {
  const m = Math.floor(Number(mins) || 0);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
};

const VideoStreakBadge = ({ compact = false }) => {
  const {
    videoStreak,
    effectiveTodayVideoMinutes,
    videoStreakTodayComplete,
    videoStreakProgressPercent,
    videoStreakRecentDays,
  } = useStudy();

  const active = videoStreakTodayComplete || videoStreak > 0;
  const label = `${videoStreak} day streak · ${formatMinutes(effectiveTodayVideoMinutes)}/${VIDEO_STREAK_GOAL_MINUTES} today`;

  if (compact) {
    return (
      <Link
        to="/mission"
        className={`group inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-all ${
          videoStreakTodayComplete
            ? "border-orange-300/80 bg-linear-to-r from-orange-50 to-amber-50 shadow-sm shadow-orange-200/50 dark:border-orange-500/40 dark:from-orange-950/40 dark:to-amber-950/30 dark:shadow-orange-900/20"
            : "border-slate-200/90 bg-white hover:border-orange-200 dark:border-white/10 dark:bg-[#141414] dark:hover:border-orange-500/30"
        }`}
        title={label}
      >
        <FireIcon size={22} active={videoStreakTodayComplete || active} />
        <span
          className={`font-display text-sm font-bold tabular-nums ${
            videoStreakTodayComplete
              ? "text-orange-600 dark:text-orange-300"
              : "text-slate-800 dark:text-slate-100"
          }`}
        >
          {videoStreak}
        </span>
      </Link>
    );
  }

  return (
    <div
      className={`rounded-2xl border p-4 ${
        videoStreakTodayComplete
          ? "border-orange-300/70 bg-linear-to-br from-orange-50 via-amber-50 to-yellow-50 dark:border-orange-500/30 dark:from-orange-950/30 dark:via-amber-950/20 dark:to-yellow-950/10"
          : "border-slate-200/90 bg-white dark:border-white/10 dark:bg-[#1a1a1a]"
      }`}
    >
      <div className="flex items-center gap-3">
        <FireIcon size={36} active={videoStreakTodayComplete || active} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Video streak</p>
          <p className="font-display mt-0.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {videoStreak}{" "}
            <span className="text-sm font-medium text-slate-500">days</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatMinutes(effectiveTodayVideoMinutes)} / {VIDEO_STREAK_GOAL_MINUTES} min today
          </p>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            videoStreakTodayComplete
              ? "bg-linear-to-r from-orange-500 to-amber-400"
              : "bg-linear-to-r from-orange-600 to-rose-500"
          }`}
          style={{ width: `${videoStreakProgressPercent}%` }}
        />
      </div>

      {videoStreakRecentDays?.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-1">
          {videoStreakRecentDays.map((day) => (
            <span
              key={day.date}
              className={`h-2 flex-1 rounded-full transition-colors ${
                day.complete
                  ? "bg-linear-to-t from-orange-600 to-amber-400 shadow-sm shadow-orange-400/40"
                  : "bg-slate-200 dark:bg-white/10"
              }`}
              title={`${day.date}: ${formatMinutes(day.minutes)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoStreakBadge;
