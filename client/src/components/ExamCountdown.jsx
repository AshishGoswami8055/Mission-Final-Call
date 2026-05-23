import { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiFlag, FiZap } from "react-icons/fi";
import {
  SEASON_END,
  SEASON_START,
  courseExamDate,
  getCourseById,
  getDefaultCourseId,
} from "../config/courses";

const DAY_MS = 24 * 60 * 60 * 1000;
const RING_SIZE = 148;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

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

const getPhase = (daysLeft) => {
  if (daysLeft < 0) return { label: "Season complete", tone: "slate", icon: "✓" };
  if (daysLeft === 0) return { label: "Exam day", tone: "rose", icon: "◎" };
  if (daysLeft <= 7) return { label: "Mission critical", tone: "rose", icon: "⚡" };
  if (daysLeft <= 14) return { label: "Final sprint", tone: "amber", icon: "▶" };
  if (daysLeft <= 30) return { label: "Sharpen phase", tone: "orange", icon: "◆" };
  if (daysLeft <= 60) return { label: "Build phase", tone: "sky", icon: "▲" };
  return { label: "Foundation phase", tone: "emerald", icon: "◉" };
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
  return Math.min(1, Math.max(0, (now.getTime() - SEASON_START.getTime()) / span));
};

const phaseStyles = {
  emerald: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30",
  sky: "bg-sky-500/20 text-sky-200 ring-sky-400/30",
  orange: "bg-orange-500/20 text-orange-200 ring-orange-400/30",
  amber: "bg-amber-500/20 text-amber-100 ring-amber-400/40",
  rose: "bg-rose-500/25 text-rose-100 ring-rose-400/40 animate-pulse",
  slate: "bg-white/10 text-slate-300 ring-white/20",
};

const TimeBlock = ({ value, label }) => (
  <div className="flex flex-col items-center rounded-xl bg-white/10 px-2.5 py-2 backdrop-blur-sm ring-1 ring-white/10">
    <span className="font-display text-lg font-bold tabular-nums leading-none text-white sm:text-xl">
      {value}
    </span>
    <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-indigo-200/70">
      {label}
    </span>
  </div>
);

const ExamCountdown = ({ compact = false, activeCourseId = getDefaultCourseId() }) => {
  const [now, setNow] = useState(new Date());

  const targetDate = useMemo(() => courseExamDate(activeCourseId), [activeCourseId]);
  const courseMeta = useMemo(() => getCourseById(activeCourseId), [activeCourseId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const daysLeft = getDayDiff(targetDate, now);
  const timeLeft = getTimeLeft(targetDate, now);
  const seasonRatio = seasonProgressRatio(now);
  const phase = getPhase(daysLeft);
  const message = getMessage(daysLeft);

  const totalSeasonDays = Math.max(1, getDayDiff(targetDate, SEASON_START));
  const daysElapsed = Math.max(0, totalSeasonDays - Math.max(daysLeft, 0));
  const urgencyRatio =
    daysLeft < 0 ? 1 : Math.min(1, Math.max(0, 1 - Math.max(daysLeft, 0) / totalSeasonDays));

  const seasonRingOffset = RING_CIRC * (1 - seasonRatio);
  const urgencyRingOffset = RING_CIRC * (1 - urgencyRatio);

  const examLabel = targetDate.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const headlineDays = daysLeft < 0 ? 0 : Math.max(daysLeft, 0);

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-indigo-200/80 bg-linear-to-r from-indigo-950 to-slate-900 px-3 py-2 text-xs text-white"
        title={`${courseMeta.title} · ${examLabel}`}
      >
        <FiCalendar className="shrink-0 text-amber-300" size={15} />
        <span className="font-semibold tabular-nums">
          {daysLeft < 0 ? "Done" : daysLeft === 0 ? "Today" : `${headlineDays}d`}
        </span>
        <span className="truncate text-indigo-200/80">to {courseMeta.title}</span>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-900/40 bg-linear-to-br from-[#0f172a] via-[#1e1b4b] to-[#0c1222] p-5 text-white shadow-xl shadow-indigo-950/25 sm:p-6">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Circular countdown */}
        <div className="flex shrink-0 flex-col items-center lg:items-start">
          <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={RING_STROKE}
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(129,140,248,0.35)"
                strokeWidth={RING_STROKE - 2}
                strokeDasharray={RING_CIRC}
                strokeDashoffset={seasonRingOffset}
                strokeLinecap="round"
                className="transition-[stroke-dashoffset] duration-1000 ease-out"
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS - 6}
                fill="none"
                stroke="url(#urgencyGradient)"
                strokeWidth={4}
                strokeDasharray={RING_CIRC * 0.85}
                strokeDashoffset={urgencyRingOffset * 0.85}
                strokeLinecap="round"
                className="transition-[stroke-dashoffset] duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="urgencyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-display text-4xl font-bold tabular-nums leading-none tracking-tight">
                {headlineDays}
              </span>
              <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-200/80">
                {daysLeft === 1 ? "day left" : "days left"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1.5 sm:gap-2">
            <TimeBlock value={String(timeLeft.hours).padStart(2, "0")} label="hrs" />
            <TimeBlock value={String(timeLeft.minutes).padStart(2, "0")} label="min" />
            <TimeBlock value={String(timeLeft.seconds).padStart(2, "0")} label="sec" />
            <TimeBlock value={`${Math.round(seasonRatio * 100)}%`} label="season" />
          </div>
        </div>

        {/* Mission info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-300/80">
                Mission countdown
              </p>
              <h3 className="font-display mt-1 text-xl font-bold leading-tight sm:text-2xl">
                {courseMeta.title}
              </h3>
              <p className="mt-1 text-xs text-indigo-200/70">{courseMeta.subtitle}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2 text-right ring-1 ring-white/10 backdrop-blur-sm">
              <p className="flex items-center justify-end gap-1 text-[9px] font-semibold uppercase tracking-wider text-amber-200/90">
                <FiCalendar size={10} /> Exam date
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{examLabel}</p>
            </div>
          </div>

          <div
            className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${phaseStyles[phase.tone]}`}
          >
            <span aria-hidden>{phase.icon}</span>
            {phase.label}
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <FiZap className="mt-0.5 shrink-0 text-amber-300" size={16} />
            <p className="text-sm font-medium leading-snug text-indigo-50/95">{message}</p>
          </div>
        </div>
      </div>

      {/* Season runway timeline */}
      <div className="relative mt-6 pt-1">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-indigo-300/70">
          <span className="flex items-center gap-1">
            <FiFlag size={10} /> Prep runway
          </span>
          <span className="tabular-nums text-indigo-200/90">
            {daysElapsed}d elapsed · {headlineDays}d to go
          </span>
        </div>

        <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-indigo-500 via-violet-500 to-amber-400 transition-all duration-1000 ease-out"
            style={{ width: `${Math.round(seasonRatio * 100)}%` }}
          />
          <div
            className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400 shadow-lg shadow-amber-500/50 transition-all duration-1000 ease-out"
            style={{ left: `calc(${Math.round(seasonRatio * 100)}% - 8px)` }}
          />
        </div>

        <div className="mt-2 flex justify-between text-[10px] font-medium text-indigo-300/60">
          <span>Mar 2026</span>
          <span className="text-amber-200/80">You are here</span>
          <span>Sept 2026</span>
        </div>
      </div>
    </div>
  );
};

export default ExamCountdown;
