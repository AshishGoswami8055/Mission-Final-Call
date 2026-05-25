import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  FiArrowRight,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiShield,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import Loader from "../components/Loader";
import { courseExamDate, getDefaultCourseId } from "../config/courses";
import { VIDEO_STREAK_GOAL_MINUTES } from "../constants/streak";
import { useStudy } from "../context/StudyContext";
import { useAuth } from "../context/AuthContext";

const REMEMBERED_LOGIN_KEY = "cds_remembered_login";

const formatTodayStudy = (minutes = 0) => {
  const mins = Math.floor(Number(minutes) || 0);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const rest = mins % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${mins}m`;
};

const getFallbackExamDays = () => {
  const exam = courseExamDate(getDefaultCourseId());
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  exam.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((exam - now) / 86400000));
};

const LoginPage = () => {
  const { login } = useAuth();
  const { todayMinutes } = useStudy();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workspaceStats, setWorkspaceStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      setStatsLoading(true);
      try {
        const { data } = await api.get("/workspace/public-stats");
        if (!cancelled) setWorkspaceStats(data);
      } catch {
        if (!cancelled) {
          setWorkspaceStats({
            examCountdownDays: getFallbackExamDays(),
            totalItems: null,
            videoCount: null,
            pdfCount: null,
          });
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };
    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const daysLeft = workspaceStats?.examCountdownDays ?? getFallbackExamDays();
  const totalItems = workspaceStats?.totalItems;
  const todayLabel = formatTodayStudy(todayMinutes);
  const todayProgress = Math.min(100, Math.round((todayMinutes / VIDEO_STREAK_GOAL_MINUTES) * 100));
  const itemsLabel =
    statsLoading && totalItems == null ? "…" : totalItems != null ? totalItems.toLocaleString() : "—";

  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBERED_LOGIN_KEY);
    if (!remembered) return;
    try {
      const parsed = JSON.parse(remembered);
      if (parsed?.email) setEmail(parsed.email);
      if (parsed?.password) setPassword(parsed.password);
      setRememberMe(true);
    } catch {
      localStorage.removeItem(REMEMBERED_LOGIN_KEY);
    }
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      if (rememberMe) {
        localStorage.setItem(
          REMEMBERED_LOGIN_KEY,
          JSON.stringify({ email: email.trim(), password })
        );
      } else {
        localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      }
      toast.success("Logged in successfully");
      navigate("/");
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="anim-fade-in flex min-h-dvh w-full flex-col bg-[#0a0c14] lg:flex-row">
      {/* Full-viewport split — no floating card, edge-to-edge */}
      <section className="relative flex min-h-[48dvh] flex-1 flex-col overflow-hidden bg-[#0a0c14] text-white lg:min-h-dvh lg:w-1/2">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full text-white/10"
        >
          <defs>
            <pattern id="login-dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-dots)" />
        </svg>
        <div className="anim-float-y pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />
        <div
          className="anim-float-y pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl"
          style={{ animationDelay: "1.2s" }}
        />

        <div className="relative z-10 flex min-h-[48dvh] flex-1 flex-col px-8 py-10 sm:px-10 lg:min-h-dvh lg:p-12">
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-display text-base font-bold text-slate-950 shadow-lg shadow-black/30">
              C
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">
              CDS Journey
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-center py-10 lg:py-12">
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
              Welcome Back,
              <br />
              Admin.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-400">
              Manage your CDS preparation workspace — videos, PDFs, previous year
              papers, vocabulary and daily targets — all from one focused dashboard.
            </p>
          </div>

          <div className="mt-auto shrink-0 space-y-3 pt-2">
            <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm lg:block">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
                  <FiShield size={16} />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-orange-400 to-amber-300 transition-[width] duration-500"
                      style={{ width: `${todayProgress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {todayProgress >= 100
                      ? "Today's 1h video goal met"
                      : `${todayLabel} of ${VIDEO_STREAK_GOAL_MINUTES}m today`}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-white/5 bg-black/30 p-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                    Days left
                  </p>
                  <p className="font-display mt-0.5 text-lg font-semibold tabular-nums text-white">
                    {statsLoading ? "…" : daysLeft}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/30 p-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                    Today
                  </p>
                  <p className="font-display mt-0.5 text-lg font-semibold tabular-nums text-white">
                    {todayLabel}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/30 p-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                    Items
                  </p>
                  <p className="font-display mt-0.5 text-lg font-semibold tabular-nums text-white">
                    {itemsLabel}
                  </p>
                </div>
              </div>
              {!statsLoading && workspaceStats?.videoCount != null && (
                <p className="mt-3 text-[10px] text-slate-500">
                  {workspaceStats.videoCount} videos · {workspaceStats.pdfCount} PDFs in library
                </p>
              )}
            </div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              CDS · IMA · 2026 written
            </p>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col items-center justify-center border-t border-slate-200 bg-white px-7 py-12 sm:px-10 lg:min-h-dvh lg:w-1/2 lg:border-l lg:border-t-0 lg:px-12">
        <div className="w-full max-w-md text-center sm:text-left">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-900">
            Admin Login
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Enter your credentials to access the admin dashboard.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5 text-left">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Email Address
              </label>
              <div className="relative">
                <FiMail
                  className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  className="input pl-11!"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Password
              </label>
              <div className="relative">
                <FiLock
                  className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  className="input pl-11! pr-11!"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <button
                type="button"
                className="text-sm font-semibold text-slate-900 transition-colors hover:underline"
                onClick={() =>
                  toast(
                    "Password reset is not enabled. Update ADMIN_PASSWORD in server/.env and restart the server."
                  )
                }
              >
                Forgot password?
              </button>
            </div>

            <button
              className="btn-primary w-full py-3! text-base"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <Loader size="sm" />
              ) : (
                <>
                  Sign In <FiArrowRight />
                </>
              )}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 sm:justify-start">
              <FiShield size={12} />
              Single-admin workspace · JWT secured
            </p>
          </form>
        </div>
      </section>
    </div>
  );
};

export default LoginPage;
