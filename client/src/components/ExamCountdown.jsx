import { useEffect, useMemo, useState } from "react";
import { FiCalendar } from "react-icons/fi";
import {
  SEASON_END,
  SEASON_START,
  courseExamDate,
  getCourseById,
  getDefaultCourseId,
} from "../config/courses";

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_CREATED_AT_KEY = "cds_journey_app_created_at";
const TRACK_SEGMENTS = 48;
const MAX_PREVIOUS_DOTS = 72;

const shell =
  "rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-[#1a1a1a]";

const getDayDiff = (target, now = new Date()) => {
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  const diffMs = t - current;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const getTimeLeft = (target, now = new Date()) => {
  const diffMs = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, diffMs };
};

const normalizeDate = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const parseValidDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return normalizeDate(parsed);
};

const getCompletedDays = (startDate, endDate = new Date()) => {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
};

const getOrCreateAppStartDate = () => {
  if (typeof window === "undefined") return normalizeDate(new Date());
  const stored = window.localStorage.getItem(APP_CREATED_AT_KEY);
  if (stored) return normalizeDate(new Date(stored));
  const today = normalizeDate(new Date());
  window.localStorage.setItem(APP_CREATED_AT_KEY, today.toISOString());
  return today;
};

const getMessage = (daysLeft) => {
  if (daysLeft > 60) return "Steady preparation wins the season.";
  if (daysLeft > 30) return "Stay consistent across the full cycle.";
  if (daysLeft > 14) return "Tighten weak areas before the paper.";
  if (daysLeft > 7) return "Final stretch — drills and revision.";
  if (daysLeft > 1) return "Almost there. Trust your routine.";
  if (daysLeft === 1) return "Tomorrow is the exam. Rest and recheck.";
  if (daysLeft === 0) return "Today is the paper. Stay calm and precise.";
  return "Season complete — review and plan the next goal.";
};

const seasonProgressRatio = (now) => {
  const span = SEASON_END.getTime() - SEASON_START.getTime();
  if (span <= 0) return 0;
  const t = now.getTime() - SEASON_START.getTime();
  return Math.min(1, Math.max(0, t / span));
};

const ExamCountdown = ({ compact = false, appMadeAt = null, activeCourseId = getDefaultCourseId() }) => {
  const [now, setNow] = useState(new Date());
  const [appStartDate, setAppStartDate] = useState(() => parseValidDate(appMadeAt) || getOrCreateAppStartDate());

  const targetDate = useMemo(() => courseExamDate(activeCourseId), [activeCourseId]);
  const courseMeta = useMemo(() => getCourseById(activeCourseId), [activeCourseId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const dataStartDate = parseValidDate(appMadeAt);
    if (dataStartDate) {
      setAppStartDate(dataStartDate);
      return;
    }
    setAppStartDate(getOrCreateAppStartDate());
  }, [appMadeAt]);

  const daysLeft = getDayDiff(targetDate, now);
  const timeLeft = getTimeLeft(targetDate, now);
  const seasonRatio = seasonProgressRatio(now);
  const filledSeason = Math.round(seasonRatio * TRACK_SEGMENTS);
  const totalCompletedDays = getCompletedDays(appStartDate, now);
  const seasonStartedDays = getCompletedDays(SEASON_START, now);
  const previousCompletedDays = Math.max(0, totalCompletedDays - Math.min(filledSeason, seasonStartedDays));
  const previousDotsToShow = Math.min(previousCompletedDays, MAX_PREVIOUS_DOTS);
  const trackerPercent = Math.round(seasonRatio * 100);

  const message = getMessage(daysLeft);
  const isToday = daysLeft === 0;
  const isPast = daysLeft < 0;
  const isTomorrow = daysLeft === 1;

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-[#1a1a1a]"
        title={`${courseMeta.title} · ${targetDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
      >
        <FiCalendar className="shrink-0 text-slate-400 dark:text-slate-500" size={15} strokeWidth={2} />
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {isPast && "Done"}
          {isToday && "Today"}
          {isTomorrow && "1 day"}
          {daysLeft > 1 && `${daysLeft} days`}
        </span>
        <span className="max-w-[140px] truncate text-slate-500 dark:text-slate-400">to {courseMeta.title}</span>
      </div>
    );
  }

  const headline =
    (isPast && "Completed") ||
    (isToday && "Today") ||
    (isTomorrow && "1 day left") ||
    (daysLeft > 1 && `${daysLeft} days left`);

  const statBox =
    "rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]";

  return (
    <div className={shell}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            Target exam · {courseMeta.title}
          </p>
          <p className="mt-2 text-[1.65rem] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
            {headline}
          </p>
          <p className="mt-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {timeLeft.days}d {String(timeLeft.hours).padStart(2, "0")}h {String(timeLeft.minutes).padStart(2, "0")}m{" "}
            {String(timeLeft.seconds).padStart(2, "0")}s
          </p>
        </div>

        <div className={`${statBox} shrink-0 text-right`}>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Exam date
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {targetDate.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={statBox}>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Remaining
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {isPast ? 0 : Math.max(daysLeft, 0)}d
          </p>
        </div>
        <div className={statBox}>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Season
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {trackerPercent}%
          </p>
        </div>
        <div className={`${statBox} sm:col-span-1`}>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Focus
          </p>
          <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-slate-600 dark:text-slate-300">
            {message}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between text-xs font-medium text-slate-400 dark:text-slate-500">
        <span>2026 prep season</span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">
          {filledSeason}/{TRACK_SEGMENTS}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {Array.from({ length: previousDotsToShow }).map((_, index) => (
          <span
            key={`prev-${index}`}
            className="h-2 w-1 shrink-0 rounded-full bg-emerald-500/85 dark:bg-emerald-400/90"
          />
        ))}
        {Array.from({ length: TRACK_SEGMENTS }).map((_, index) => (
          <span
            key={`seg-${index}`}
            className={`h-2 w-1 shrink-0 rounded-full transition-colors ${
              index < filledSeason
                ? "bg-slate-800 dark:bg-slate-200"
                : "bg-slate-200/90 dark:bg-white/15"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default ExamCountdown;
