import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiFlag, FiZap } from "react-icons/fi";
import {
  SEASON_START,
  courseExamDate,
  getCourseById,
  getDefaultCourseId,
  getSeasonEnd,
} from "../config/courses";

const DAY_MS = 24 * 60 * 60 * 1000;
const RING_SIZE = 132;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

const shell =
  "rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-[#1a1a1a]";

const statBox =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]";

const getDayDiff = (target, now = new Date()) => {
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  return Math.ceil((t - current) / DAY_MS);
};

const getTimeLeft = (target, now = new Date()) => {
  const diffMs = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

const normalizeDate = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const getPhase = (daysLeft, prepStarted) => {
  if (!prepStarted) return { label: "Starts tomorrow", tone: "teal" };
  if (daysLeft < 0) return { label: "Season complete", tone: "slate" };
  if (daysLeft === 0) return { label: "Exam day", tone: "rose" };
  if (daysLeft <= 7) return { label: "Final week", tone: "rose" };
  if (daysLeft <= 14) return { label: "Final sprint", tone: "amber" };
  if (daysLeft <= 30) return { label: "Sharpen phase", tone: "orange" };
  if (daysLeft <= 60) return { label: "Build phase", tone: "sky" };
  return { label: "Foundation phase", tone: "emerald" };
};

const getMessage = (daysLeft, prepStarted) => {
  if (!prepStarted) return "Your prep season begins tomorrow — get ready to launch.";
  if (daysLeft > 60) return "Steady preparation wins the season.";
  if (daysLeft > 30) return "Stay consistent across the full cycle.";
  if (daysLeft > 14) return "Tighten weak areas before the paper.";
  if (daysLeft > 7) return "Final stretch — drills and revision.";
  if (daysLeft > 1) return "Almost there. Trust your routine.";
  if (daysLeft === 1) return "Tomorrow is the exam. Rest and recheck.";
  if (daysLeft === 0) return "Today is the paper. Stay calm and precise.";
  return "Season complete — review and plan the next goal.";
};

const seasonProgressRatio = (now, seasonStart, seasonEnd) => {
  const start = normalizeDate(seasonStart);
  const end = normalizeDate(seasonEnd);
  const current = normalizeDate(now);
  if (current < start) return 0;
  const span = end.getTime() - start.getTime();
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (current.getTime() - start.getTime()) / span));
};

const phaseStyles = {
  teal: "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/50",
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50",
  sky: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/50",
  orange: "bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-800/50",
  amber: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800/50",
  rose: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50 animate-pulse",
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15",
};

const formatShortDate = (date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const TimeBlock = ({ value, label }) => (
  <div className={`${statBox} flex flex-col items-center px-2 py-2`}>
    <span className="font-display text-base font-bold tabular-nums leading-none text-slate-900 dark:text-slate-50 sm:text-lg">
      {value}
    </span>
    <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
      {label}
    </span>
  </div>
);

const ExamCountdown = ({ compact = false, activeCourseId = getDefaultCourseId() }) => {
  const [now, setNow] = useState(new Date());

  const targetDate = useMemo(() => courseExamDate(activeCourseId), [activeCourseId]);
  const seasonEnd = useMemo(() => getSeasonEnd(activeCourseId), [activeCourseId]);
  const courseMeta = useMemo(() => getCourseById(activeCourseId), [activeCourseId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const prepStarted = normalizeDate(now) >= normalizeDate(SEASON_START);
  const daysLeft = getDayDiff(targetDate, now);
  const timeLeft = getTimeLeft(targetDate, now);
  const seasonRatio = seasonProgressRatio(now, SEASON_START, seasonEnd);
  const phase = getPhase(daysLeft, prepStarted);
  const message = getMessage(daysLeft, prepStarted);

  const totalSeasonDays = Math.max(1, getDayDiff(targetDate, SEASON_START));
  const daysElapsed = prepStarted
    ? Math.max(0, getDayDiff(now, SEASON_START) - 1)
    : 0;
  const daysUntilStart = prepStarted ? 0 : getDayDiff(SEASON_START, now);

  const seasonRingOffset = RING_CIRC * (1 - seasonRatio);
  const examRingRatio =
    daysLeft < 0 ? 1 : Math.min(1, Math.max(0, 1 - Math.max(daysLeft, 0) / totalSeasonDays));
  const examRingOffset = RING_CIRC * (1 - examRingRatio);

  const examLabel = targetDate.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const headlineDays = daysLeft < 0 ? 0 : Math.max(daysLeft, 0);
  const startLabel = formatShortDate(SEASON_START);
  const endLabel = formatShortDate(targetDate);

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-[#1a1a1a]"
        title={`${courseMeta.title} · ${examLabel}`}
      >
        <FiCalendar className="shrink-0 text-teal-600 dark:text-teal-400" size={15} />
        <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {!prepStarted ? `${daysUntilStart}d to start` : daysLeft === 0 ? "Today" : `${headlineDays}d`}
        </span>
        <span className="truncate text-slate-500 dark:text-slate-400">to {courseMeta.title}</span>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Countdown ring */}
        <div className="flex shrink-0 flex-col items-center lg:items-start">
          <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                className="text-slate-200 dark:text-white/10"
                strokeWidth={RING_STROKE}
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                className="text-teal-500 transition-[stroke-dashoffset] duration-1000 ease-out dark:text-teal-400"
                strokeWidth={RING_STROKE - 2}
                strokeDasharray={RING_CIRC}
                strokeDashoffset={seasonRingOffset}
                strokeLinecap="round"
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS - 5}
                fill="none"
                stroke="currentColor"
                className="text-slate-800 transition-[stroke-dashoffset] duration-1000 ease-out dark:text-slate-200"
                strokeWidth={3}
                strokeDasharray={RING_CIRC * 0.88}
                strokeDashoffset={examRingOffset * 0.88}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-display text-3xl font-bold tabular-nums leading-none tracking-tight text-slate-900 dark:text-slate-50">
                {headlineDays}
              </span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                {daysLeft === 1 ? "day left" : "days left"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid w-full max-w-[220px] grid-cols-4 gap-1.5">
            <TimeBlock value={String(timeLeft.hours).padStart(2, "0")} label="hrs" />
            <TimeBlock value={String(timeLeft.minutes).padStart(2, "0")} label="min" />
            <TimeBlock value={String(timeLeft.seconds).padStart(2, "0")} label="sec" />
            <TimeBlock value={`${Math.round(seasonRatio * 100)}%`} label="season" />
          </div>
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                Target exam
              </p>
              <h3 className="font-display mt-1 text-xl font-bold leading-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
                {courseMeta.title}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{courseMeta.subtitle}</p>
            </div>
            <div className={`${statBox} shrink-0 text-right`}>
              <p className="flex items-center justify-end gap-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <FiCalendar size={10} /> Exam date
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {examLabel}
              </p>
            </div>
          </div>

          <div
            className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${phaseStyles[phase.tone]}`}
          >
            {phase.label}
          </div>

          <div className={`mt-4 flex items-start gap-2.5 ${statBox} p-3`}>
            <FiZap className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" size={16} />
            <p className="text-sm font-medium leading-snug text-slate-600 dark:text-slate-300">{message}</p>
          </div>
        </div>
      </div>

      {/* Prep timeline */}
      <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/10">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1">
            <FiFlag size={10} /> Prep season
          </span>
          <span className="tabular-nums text-slate-500 dark:text-slate-400">
            {!prepStarted
              ? `Starts in ${daysUntilStart} day${daysUntilStart === 1 ? "" : "s"}`
              : `${daysElapsed}d elapsed · ${headlineDays}d to exam`}
          </span>
        </div>

        <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-teal-600 transition-all duration-1000 ease-out dark:bg-teal-500"
            style={{ width: `${Math.max(0, Math.round(seasonRatio * 100))}%` }}
          />
          {prepStarted && seasonRatio > 0 && (
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-teal-600 shadow-sm transition-all duration-1000 ease-out dark:border-[#1a1a1a] dark:bg-teal-400"
              style={{ left: `calc(${Math.round(seasonRatio * 100)}% - 7px)` }}
            />
          )}
        </div>

        <div className="mt-2 flex justify-between text-[10px] font-medium text-slate-400 dark:text-slate-500">
          <span>{startLabel}</span>
          {!prepStarted ? (
            <span className="font-semibold text-teal-700 dark:text-teal-400">Study starts tomorrow</span>
          ) : (
            <span className="text-teal-700 dark:text-teal-400">You are here</span>
          )}
          <span>{endLabel}</span>
        </div>
      </div>
    </div>
  );
};

export default ExamCountdown;
