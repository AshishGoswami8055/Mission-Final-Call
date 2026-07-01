import { FiAlertTriangle, FiCheckCircle, FiLoader, FiRefreshCw } from "react-icons/fi";
import { Link } from "react-router-dom";

const TelegramConnectionStatus = ({
  checking = false,
  connected = false,
  live = false,
  error = "",
  phone = "",
  isDark = false,
  onRefresh,
  onResetSession,
  resetting = false,
}) => {
  if (checking) {
    return (
      <div
        className={`mb-0 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm md:mb-3 md:py-2 ${
          isDark ? "border-neutral-700 bg-neutral-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        <FiLoader className="animate-spin shrink-0" size={16} />
        Checking Telegram connection…
      </div>
    );
  }

  if (live) {
    return (
      <div
        className={`mb-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm md:mb-3 ${
          isDark
            ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-300"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        <div className="flex items-center gap-2">
          <FiCheckCircle className="shrink-0" size={16} />
          <span>
            Telegram connected{phone ? ` (${phone})` : ""} — streaming is ready.
          </span>
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={onRefresh}>
          <FiRefreshCw size={13} /> Recheck
        </button>
      </div>
    );
  }

  return (
    <div
      className={`mb-0 rounded-xl border px-3 py-3 text-sm md:mb-3 ${
        isDark ? "border-amber-900/50 bg-amber-950/30 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="flex items-start gap-2">
        <FiAlertTriangle className="mt-0.5 shrink-0" size={16} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium">
            {connected ? "Telegram session found but not responding" : "Telegram is not connected"}
          </p>
          <p className={`text-xs ${isDark ? "text-amber-200/90" : "text-amber-800/90"}`}>
            {error ||
              "Videos streamed from Telegram may buffer forever until you log in and the server reconnects."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/import/telegram" className="btn-secondary text-xs">
              Open Telegram settings
            </Link>
            <button type="button" className="btn-secondary text-xs" onClick={onRefresh}>
              <FiRefreshCw size={13} /> Recheck
            </button>
            {connected ? (
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={onResetSession}
                disabled={resetting}
              >
                {resetting ? "Resetting…" : "Reset Telegram session"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelegramConnectionStatus;
