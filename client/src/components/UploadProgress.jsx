import { FiCheck, FiCloud, FiCpu, FiUploadCloud, FiAlertTriangle, FiFilm } from "react-icons/fi";

/**
 * Upload pipeline phases — kept in display order. The current `state.phase`
 * decides which step is active, completed, or pending.
 */
const PHASE_ORDER = ["received", "downloading", "compressing", "uploading", "finalizing", "done"];
const PHASE_INDEX = Object.fromEntries(PHASE_ORDER.map((p, i) => [p, i]));

const STEPS = [
  { key: "received", title: "Sending", subtitle: "Browser → server", icon: FiUploadCloud },
  { key: "downloading", title: "Fetching", subtitle: "From source", icon: FiCloud, ytOnly: true },
  { key: "compressing", title: "Compressing", subtitle: "720p H.264", icon: FiFilm },
  { key: "uploading", title: "Uploading", subtitle: "Server → Cloudinary", icon: FiCloud },
  { key: "finalizing", title: "Finalizing", subtitle: "Persisting record", icon: FiCpu },
  { key: "done", title: "Complete", subtitle: "Ready to use", icon: FiCheck },
];

const PHASE_LABEL = {
  idle: "Preparing",
  pending: "Preparing",
  received: "Sending file to server",
  "server-recv": "Sending file to server",
  downloading: "Downloading from source",
  compressing: "Compressing video to 720p",
  uploading: "Uploading to Cloudinary",
  finalizing: "Finalizing",
  done: "Upload complete",
  error: "Upload failed",
};

const formatBytes = (n) => {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  if (v <= 0) return "0 B";
  if (v < 1024) return `${Math.round(v)} B`;
  const kb = v / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(2) : gb.toFixed(1)} GB`;
};

const formatSpeed = (bps) => {
  if (!bps || !Number.isFinite(bps) || bps <= 0) return "—";
  return `${formatBytes(bps)}/s`;
};

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
};

/**
 * Polished multi-phase upload loader.
 *
 * Props:
 *   state: {
 *     active, phase, percent, bytesLoaded, bytesTotal, bytesPerSecond,
 *     fileIndex, filesTotal, currentFile, message, error,
 *     browserPercent  // optional: browser→server percent reported by axios onUploadProgress
 *   }
 *   variant: "youtube" | "upload" — adjusts step list (skip download for plain upload)
 */
const UploadProgress = ({ state, variant = "upload" }) => {
  if (!state?.active) return null;

  const phase = state.error ? "error" : state.phase || "pending";
  const isError = phase === "error";
  const isDone = phase === "done";
  const phaseIndex = PHASE_INDEX[phase] ?? -1;

  // Compute the headline percent. While `phase === "uploading"` we use the
  // server-reported byte percent; before that, fall back to the browser's
  // multipart upload percent (if provided) so the bar is never frozen.
  const browserPct = Math.max(0, Math.min(100, Number(state.browserPercent) || 0));
  const serverPct = Math.max(0, Math.min(100, Number(state.percent) || 0));
  let headlinePct = 0;
  if (isDone) {
    headlinePct = 100;
  } else if (phase === "uploading" || phase === "finalizing") {
    headlinePct = phase === "finalizing" ? 99 : Math.max(serverPct, 1);
  } else if (phase === "compressing") {
    headlinePct = Math.max(serverPct, 1);
  } else if (phase === "downloading") {
    headlinePct = Math.max(serverPct, 5);
  } else {
    headlinePct = Math.max(browserPct * 0.4, 1); // pre-upload phase shouldn't dominate the bar
  }

  const bytesEta =
    state.bytesPerSecond > 0 && state.bytesTotal > state.bytesLoaded
      ? (state.bytesTotal - state.bytesLoaded) / state.bytesPerSecond
      : null;

  const visibleSteps = STEPS.filter((s) => (s.ytOnly ? variant === "youtube" : true));

  // Indeterminate stripe pattern when we have no real percent yet (e.g. before
  // the server has reported any bytes for the cloud phase, or during YT download).
  const isIndeterminate =
    !isError &&
    !isDone &&
    (phase === "pending" ||
      phase === "received" ||
      (phase === "downloading" && (!state.bytesTotal || state.bytesTotal === 0)) ||
      (phase === "compressing" && (!state.bytesTotal || state.bytesTotal === 0)) ||
      (phase === "uploading" && (!state.bytesTotal || state.bytesTotal === 0)));

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${
        isError
          ? "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/30"
          : "border-slate-200 bg-linear-to-br from-slate-50 to-white dark:border-slate-700 dark:from-slate-900 dark:to-slate-900/60"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isError ? (
              <FiAlertTriangle size={16} className="shrink-0 text-rose-600 dark:text-rose-400" />
            ) : (
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {!isDone && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
                )}
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    isDone ? "bg-emerald-500" : "bg-indigo-500"
                  }`}
                />
              </span>
            )}
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {isError
                ? state.error || "Upload failed"
                : state.message || PHASE_LABEL[phase] || "Working"}
            </p>
          </div>
          {state.currentFile && !isError && (
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {state.filesTotal > 1 ? (
                <>
                  File <span className="tabular-nums">{(state.fileIndex || 0) + 1}</span>
                  <span className="text-slate-400"> / </span>
                  <span className="tabular-nums">{state.filesTotal}</span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                </>
              ) : null}
              <span className="font-medium text-slate-600 dark:text-slate-300">{state.currentFile}</span>
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`font-display text-2xl font-semibold leading-none tabular-nums ${
              isError
                ? "text-rose-600 dark:text-rose-400"
                : isDone
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-800 dark:text-slate-100"
            }`}
          >
            {isError ? "—" : `${Math.round(headlinePct)}%`}
          </p>
          {!isError && state.bytesTotal > 0 ? (
            <p className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {phase === "compressing"
                ? `${state.bytesLoaded || 0}s / ${state.bytesTotal || 0}s`
                : `${formatBytes(state.bytesLoaded)} / ${formatBytes(state.bytesTotal)}`}
            </p>
          ) : null}
        </div>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
        {isIndeterminate ? (
          <div className="absolute inset-y-0 -left-1/3 w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-linear-to-r from-indigo-400 via-indigo-500 to-indigo-400" />
        ) : (
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${
              isError
                ? "bg-rose-500"
                : isDone
                  ? "bg-emerald-500"
                  : "bg-linear-to-r from-indigo-500 via-indigo-500 to-violet-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(2, headlinePct))}%` }}
          />
        )}
        {!isError && !isDone && (
          <div className="pointer-events-none absolute inset-0 animate-[shine_2s_linear_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)] bg-size-[200%_100%] mix-blend-overlay" />
        )}
      </div>

      {!isError && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          {phase === "compressing" && state.compressSpeed && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-indigo-400" />
              <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">{state.compressSpeed}</span>
            </span>
          )}
          {phase !== "compressing" && state.bytesPerSecond > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-indigo-400" />
              <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                {formatSpeed(state.bytesPerSecond)}
              </span>
            </span>
          )}
          {bytesEta != null && (
            <span className="inline-flex items-center gap-1">
              <span className="text-slate-400 dark:text-slate-500">ETA</span>
              <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">{formatEta(bytesEta)}</span>
            </span>
          )}
          {state.destination === "youtube" ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-slate-400 dark:text-slate-500">via</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                YouTube · Unlisted
              </span>
            </span>
          ) : state.cloudType ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-slate-400 dark:text-slate-500">via</span>
              <span className="font-medium text-slate-600 dark:text-slate-300">{state.cloudType}</span>
            </span>
          ) : null}
        </div>
      )}

      <ol
        className="mt-4 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${visibleSteps.length}, minmax(0, 1fr))` }}
      >
        {visibleSteps.map((step, idx) => {
          const stepIdx = PHASE_INDEX[step.key];
          const completed = !isError && phaseIndex > stepIdx;
          const active = !isError && phaseIndex === stepIdx;
          const StepIcon = step.icon;
          return (
            <li key={step.key} className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${
                  isError && idx === Math.max(0, phaseIndex)
                    ? "border-rose-300 bg-rose-100 text-rose-600 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                    : completed
                      ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : active
                        ? "border-indigo-300 bg-indigo-100 text-indigo-700 ring-4 ring-indigo-100/60 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-950/40"
                        : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                }`}
              >
                {completed ? <FiCheck size={13} strokeWidth={2.6} /> : <StepIcon size={13} />}
              </div>
              <p
                className={`text-center text-[10px] font-medium leading-tight ${
                  active
                    ? "text-indigo-700 dark:text-indigo-300"
                    : completed
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {step.title}
              </p>
            </li>
          );
        })}
      </ol>

      <style>{`
        @keyframes indeterminate {
          0%   { left: -33%; width: 33%; }
          50%  { left: 33%;  width: 50%; }
          100% { left: 100%; width: 33%; }
        }
        @keyframes shine {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
};

export default UploadProgress;
