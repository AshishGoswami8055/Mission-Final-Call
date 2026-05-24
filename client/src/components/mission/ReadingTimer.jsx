import { FiBookOpen, FiCheck, FiClock, FiPause, FiPlay } from "react-icons/fi";
import { useCallback, useEffect, useRef, useState } from "react";

const formatTimer = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const ReadingTimer = ({ reading, onStart, onPause, onResume, onComplete, busy = false, compact = false }) => {
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
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
            <FiBookOpen size={17} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Reading timer</p>
            <p className={`font-display mt-1 font-bold tabular-nums text-slate-900 dark:text-white ${compact ? "text-2xl" : "text-3xl"}`}>
              {formatTimer(displaySeconds)}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <FiClock size={12} />
              Target {targetMinutes} min · {progress}%
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-slate-900 transition-all duration-500 dark:bg-slate-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === "idle" || status === "paused" ? (
          <button
            type="button"
            className="btn-primary text-xs!"
            disabled={busy}
            onClick={() => (status === "paused" ? onResume?.() : onStart?.())}
          >
            <FiPlay size={14} /> {status === "paused" ? "Resume" : "Start"}
          </button>
        ) : (
          <button type="button" className="btn-secondary text-xs!" disabled={busy} onClick={handlePause}>
            <FiPause size={14} /> Pause
          </button>
        )}
        <button
          type="button"
          className="btn-secondary text-xs!"
          disabled={busy || status === "completed"}
          onClick={handleComplete}
        >
          <FiCheck size={14} /> Complete
        </button>
      </div>
    </section>
  );
};

export default ReadingTimer;
