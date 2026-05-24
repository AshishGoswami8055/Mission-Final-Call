import { FiBookOpen, FiClock, FiPause, FiPlay, FiCheck } from "react-icons/fi";
import { useCallback, useEffect, useRef, useState } from "react";

const formatTimer = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const ReadingTimer = ({
  reading,
  onStart,
  onPause,
  onResume,
  onComplete,
  onUpdateTarget,
  busy = false,
}) => {
  const baseSeconds = reading?.accumulatedSeconds || 0;
  const targetMinutes = reading?.targetMinutes || 60;
  const status = reading?.status || "idle";

  const [displaySeconds, setDisplaySeconds] = useState(baseSeconds);
  const tickRef = useRef(null);
  const startedAtRef = useRef(null);

  useEffect(() => {
    setDisplaySeconds(reading?.accumulatedSeconds || 0);
  }, [reading?.accumulatedSeconds]);

  useEffect(() => {
    if (status !== "running") {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return undefined;
    }
    startedAtRef.current = Date.now();
    tickRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setDisplaySeconds(baseSeconds + elapsed);
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [status, baseSeconds]);

  const progress = Math.min(100, Math.round((displaySeconds / (targetMinutes * 60)) * 100));

  const handlePause = useCallback(async () => {
    const elapsed = status === "running" ? displaySeconds : baseSeconds;
    await onPause?.(elapsed);
  }, [status, displaySeconds, baseSeconds, onPause]);

  const handleComplete = useCallback(async () => {
    const elapsed = status === "running" ? displaySeconds : baseSeconds;
    await onComplete?.(elapsed);
  }, [status, displaySeconds, baseSeconds, onComplete]);

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-linear-to-br from-emerald-950/20 via-[#0f1410] to-[#141414] p-5 text-white shadow-lg dark:border-emerald-500/20">
      <div className="flex items-center gap-2 text-emerald-400">
        <FiBookOpen size={18} />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Reading mission</span>
      </div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-4xl font-bold tabular-nums tracking-tight">
            {formatTimer(displaySeconds)}
          </p>
      <p className="mt-2 flex items-center gap-1 text-sm text-emerald-200/70">
        <FiClock size={14} />
        Fixed target: 1 hour · {progress}% complete today
      </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "idle" || status === "paused" ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
              disabled={busy}
              onClick={() => (status === "paused" ? onResume?.() : onStart?.())}
            >
              <FiPlay size={16} /> {status === "paused" ? "Resume" : "Start"}
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"
              disabled={busy}
              onClick={handlePause}
            >
              <FiPause size={16} /> Pause
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
            disabled={busy || status === "completed"}
            onClick={handleComplete}
          >
            <FiCheck size={16} /> Complete
          </button>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-300 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <label htmlFor="reading-target">Daily target (min)</label>
        <input
          id="reading-target"
          type="number"
          min={60}
          max={60}
          readOnly
          className="input w-20 py-1! text-xs! opacity-70"
          value={60}
        />
      </div>
    </div>
  );
};

export default ReadingTimer;
