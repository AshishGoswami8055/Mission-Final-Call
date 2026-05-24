import { FiBookOpen, FiCheck, FiClock, FiPause, FiPlay } from "react-icons/fi";
import { useCallback, useEffect, useRef, useState } from "react";

const shell =
  "rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-[#1a1a1a]";

const formatTimer = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const ReadingTimer = ({ reading, onStart, onPause, onResume, onComplete, busy = false }) => {
  const baseSeconds = reading?.accumulatedSeconds || 0;
  const targetMinutes = reading?.targetMinutes || 60;
  const status = reading?.status || "idle";

  const [displaySeconds, setDisplaySeconds] = useState(baseSeconds);
  const tickRef = useRef(null);

  useEffect(() => {
    setDisplaySeconds(reading?.accumulatedSeconds || 0);
  }, [reading?.accumulatedSeconds]);

  useEffect(() => {
    if (status !== "running") {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return undefined;
    }
    const started = Date.now();
    tickRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
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
    <section className={shell}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 text-white shadow-md">
            <FiBookOpen size={20} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
              Reading session
            </p>
            <p className="font-display mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
              {formatTimer(displaySeconds)}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
              <FiClock size={14} />
              Target 1 hour · {progress}% complete
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {status === "idle" || status === "paused" ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={busy}
              onClick={() => (status === "paused" ? onResume?.() : onStart?.())}
            >
              <FiPlay size={16} /> {status === "paused" ? "Resume" : "Start"}
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              disabled={busy}
              onClick={handlePause}
            >
              <FiPause size={16} /> Pause
            </button>
          )}
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            disabled={busy || status === "completed"}
            onClick={handleComplete}
          >
            <FiCheck size={16} /> Complete
          </button>
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-linear-to-r from-emerald-500 to-teal-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  );
};

export default ReadingTimer;
