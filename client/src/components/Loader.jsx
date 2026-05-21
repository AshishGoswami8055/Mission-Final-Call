/**
 * Universal loader. Use the variants:
 *   <Loader />                       inline default spinner
 *   <Loader label="Loading…" />      spinner + helper text
 *   <Loader variant="dots" />        animated three-dot loader
 *   <Loader fullPage />              fixed full-page overlay with backdrop blur
 *   <Skeleton lines={3} />           shimmer placeholder block
 */

const sizes = {
  sm: { spinner: "h-5 w-5", stroke: 3 },
  md: { spinner: "h-9 w-9", stroke: 4 },
  lg: { spinner: "h-14 w-14", stroke: 4 },
  xl: { spinner: "h-20 w-20", stroke: 3.5 },
};

const Spinner = ({ size = "md", className = "" }) => {
  const s = sizes[size] || sizes.md;
  return (
    <span className={`loader-spinner ${s.spinner} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 50 50">
        <defs>
          <linearGradient id="loader-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="25" cy="25" r="20" stroke="url(#loader-gradient)" strokeWidth={s.stroke} />
      </svg>
    </span>
  );
};

const Dots = ({ className = "" }) => (
  <span className={`loader-dots text-blue-500 dark:text-blue-400 ${className}`} aria-hidden="true">
    <span />
    <span />
    <span />
  </span>
);

const Loader = ({
  variant = "spinner",
  size = "md",
  label = "",
  fullPage = false,
  percent = null,
  className = "",
}) => {
  const indicator = variant === "dots" ? <Dots /> : <Spinner size={size} />;

  if (fullPage) {
    return (
      <div className="loader-overlay" role="status" aria-live="polite">
        <div className="anim-scale-in flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-none">
          {indicator}
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {label || "Loading…"}
          </p>
          {percent != null && (
            <>
              <p className="font-display text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                {Math.round(percent)}%
              </p>
              <div className="progress-bar h-2 w-full">
                <div
                  className="progress-bar-fill progress-bar-fill-default h-full transition-all duration-300"
                  style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400 ${className}`}
    >
      <div className="inline-flex items-center gap-3">
        {indicator}
        {label && (
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
        )}
      </div>
      {percent != null && (
        <p className="text-xs font-semibold tabular-nums text-teal-700 dark:text-teal-400">{Math.round(percent)}%</p>
      )}
    </div>
  );
};

export const Skeleton = ({
  className = "",
  height = "h-4",
  width = "w-full",
  rounded = "rounded-md",
}) => (
  <div className={`skeleton ${height} ${width} ${rounded} ${className}`} aria-hidden="true" />
);

export const SkeletonStack = ({ lines = 3, className = "" }) => (
  <div className={`space-y-2 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, idx) => (
      <Skeleton
        key={idx}
        height="h-3"
        width={idx === lines - 1 ? "w-2/3" : "w-full"}
      />
    ))}
  </div>
);

/** Card-shaped skeleton suitable for grid placeholders. */
export const SkeletonCard = ({ className = "", tall = false }) => (
  <div className={`card overflow-hidden rounded-xl ${className}`} aria-hidden="true">
    <Skeleton height={tall ? "h-28" : "h-20"} rounded="rounded-none" />
    <div className={tall ? "space-y-3 p-4" : "space-y-2 p-3"}>
      <Skeleton height="h-4" width="w-4/5" />
      <Skeleton height="h-3" width="w-3/5" />
      {tall && <Skeleton height="h-3" width="w-2/5" />}
      <div className={`flex flex-col gap-2 ${tall ? "pt-2" : "pt-0.5"}`}>
        <Skeleton height={tall ? "h-10" : "h-8"} className="w-full" rounded="rounded-lg" />
        <Skeleton height={tall ? "h-10" : "h-8"} className="w-full" rounded="rounded-lg" />
      </div>
    </div>
  </div>
);

export default Loader;
