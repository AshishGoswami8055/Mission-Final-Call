import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowLeft, FiLoader, FiMoon, FiRefreshCw, FiStar, FiSun } from "react-icons/fi";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import CdsPlyrPlayer from "../components/CdsPlyrPlayer";
import StudyTracker from "../components/StudyTracker";
import VideoStreakBadge from "../components/streak/VideoStreakBadge";
import { useTheme } from "../context/ThemeContext";
import { formatFileSize } from "../utils/media";
import { fetchFullCourseStatus, getFullCourseStreamUrl } from "../utils/subjectFullCourse";

const FULL_COURSE_POSITION_KEY = (subjectId) => `cds_full_course_position_${subjectId}`;
const PAGE_THEME_KEY = "cds_video_page_theme";

const formatClock = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const savePosition = (subjectId, currentTime) => {
  if (!subjectId || currentTime == null) return;
  try {
    localStorage.setItem(FULL_COURSE_POSITION_KEY(subjectId), String(currentTime));
  } catch {
    /* ignore */
  }
};

const loadPosition = (subjectId) => {
  if (!subjectId) return null;
  try {
    const value = localStorage.getItem(FULL_COURSE_POSITION_KEY(subjectId));
    return value != null ? parseFloat(value, 10) : null;
  } catch {
    return null;
  }
};

const SubjectFullVideoPage = () => {
  const { subjectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [pageDark, setPageDark] = useState(() => {
    try {
      const saved = localStorage.getItem(PAGE_THEME_KEY);
      if (saved === "dark") return true;
      if (saved === "light") return false;
    } catch {
      /* ignore */
    }
    return theme === "dark";
  });
  const isDark = pageDark;

  const [phase, setPhase] = useState("preparing");
  const [status, setStatus] = useState(null);
  const [playbackSrc, setPlaybackSrc] = useState("");
  const [playerReady, setPlayerReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [loadError, setLoadError] = useState("");

  const videoRef = useRef(null);
  const lastSavedRef = useRef(0);

  const subjectName = status?.subjectName || location.state?.subjectName || "Subject";

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_THEME_KEY, pageDark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [pageDark]);

  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;

    const prepare = async () => {
      setPhase("preparing");
      setPlayerReady(false);
      setPlaybackSrc("");
      setLoadError("");
      try {
        const { data } = await fetchFullCourseStatus(subjectId);
        if (cancelled) return;

        setStatus(data);

        if (data?.ready) {
          setPlaybackSrc(getFullCourseStreamUrl(subjectId));
          setPhase("ready");
          setPlayerReady(true);
          return;
        }

        setPhase("missing");
      } catch (error) {
        if (cancelled) return;
        setPhase("error");
        toast.error(error.response?.data?.message || error.message || "Could not load full course video");
      }
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  useEffect(() => {
    if (!subjectId || !playerReady || !videoRef.current) return;
    const saved = loadPosition(subjectId);
    if (saved == null || saved < 5) return;
    const video = videoRef.current;
    const apply = () => {
      if (video.duration > 0 && saved < video.duration - 10) {
        video.currentTime = saved;
        setCurrentTime(saved);
      }
    };
    if (video.readyState >= 1) apply();
    else video.addEventListener("loadedmetadata", apply, { once: true });
  }, [subjectId, playerReady, playbackSrc]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    const delta = Math.abs(video.currentTime - lastSavedRef.current);
    if (delta >= 5) {
      lastSavedRef.current = video.currentTime;
      savePosition(subjectId, video.currentTime);
    }
  }, [subjectId]);

  const handlePlayerError = useCallback(() => {
    const video = videoRef.current;
    const code = video?.error?.code;
    const messages = {
      1: "Playback aborted",
      2: "Network error — is the server running on port 5001?",
      3: "Video decode error — file may be corrupted or use H.264/AAC MP4",
      4: "Format not supported — check server is on port 5001 and file is a valid MP4",
    };
    const message = messages[code] || "Could not load video";
    setLoadError(message);
    toast.error(`${message}. Restart the server and refresh if this persists.`);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    setLoadError("");
    const video = videoRef.current;
    if (!video) return;
    const dur = Number(video.duration);
    if (Number.isFinite(dur) && dur > 0) {
      setDuration(dur);
    }
  }, []);

  const durationLabel = duration > 0 ? formatClock(duration) : "";

  return (
    <div
      className={`page-viewer page-viewer--watch ${
        isDark ? "page-viewer--dark text-slate-100" : "text-slate-800"
      }`}
    >
      <header className="watch-toolbar hidden md:flex lg:mx-auto lg:max-w-[1400px] lg:border-0 lg:bg-transparent lg:px-6 lg:backdrop-blur-none">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
          <Link
            to="/"
            className={`inline-flex shrink-0 items-center justify-center rounded-full p-2 transition ${
              isDark
                ? "text-white hover:bg-white/10"
                : "text-slate-800 hover:bg-slate-100"
            } sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:px-3 sm:py-2 sm:text-sm sm:font-medium sm:shadow-sm dark:sm:border-slate-700 dark:sm:bg-slate-900 dark:sm:text-slate-200`}
            aria-label="Back to dashboard"
          >
            <FiArrowLeft size={20} />
            <span className="hidden sm:ml-1 sm:inline">Back</span>
          </Link>
          <StudyTracker compact />
          <VideoStreakBadge compact />
        </div>
        <button
          type="button"
          className={`inline-flex shrink-0 items-center justify-center rounded-full p-2 transition ${
            isDark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100"
          } sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:p-2.5 dark:sm:border-slate-700 dark:sm:bg-slate-900`}
          onClick={() => setPageDark((value) => !value)}
          aria-label="Toggle page theme"
        >
          {isDark ? <FiSun size={18} /> : <FiMoon size={18} />}
        </button>
      </header>

      <div className="watch-stage">
        <div className="watch-float-nav md:hidden" aria-hidden={false}>
          <Link to="/" className="watch-float-btn" aria-label="Back">
            <FiArrowLeft size={20} />
          </Link>
          <button
            type="button"
            className="watch-float-btn"
            onClick={() => setPageDark((value) => !value)}
            aria-label="Toggle theme"
          >
            {isDark ? <FiSun size={18} /> : <FiMoon size={18} />}
          </button>
        </div>

        {phase === "preparing" ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
            <FiLoader className="animate-spin text-3xl text-teal-400" />
            <p className="text-sm font-medium text-white">Loading full course video…</p>
          </div>
        ) : phase === "missing" ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
            <p className="text-sm font-medium text-white">No full course video linked yet</p>
            <p className="max-w-md text-xs text-slate-400">
              Go back to the subject and use <strong>Replace full course</strong> to link your edited MP4.
            </p>
            <button type="button" className="btn-secondary text-sm" onClick={() => navigate(-1)}>
              Back to subject
            </button>
          </div>
        ) : phase === "error" ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center">
            <p className="text-sm font-medium text-white">Could not load full course video</p>
            <button type="button" className="btn-secondary text-sm" onClick={() => navigate(0)}>
              Try again
            </button>
          </div>
        ) : (
          <div className="cds-plyr-shell group relative aspect-video w-full overflow-hidden bg-black">
            <CdsPlyrPlayer
              key={`full-course-${subjectId}-${playbackSrc}`}
              contentId={`full-course-${subjectId}`}
              src={playbackSrc}
              ready={playerReady}
              videoRef={videoRef}
              videoPreload="metadata"
              crossOriginMode="none"
              scrubPreviewEnabled={false}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onError={handlePlayerError}
            />
          </div>
        )}
      </div>

      <div className="watch-body">
        <div className="watch-meta">
          <h1 className="text-[15px] font-semibold leading-snug md:text-2xl">
            {subjectName} — full course
          </h1>
          <p className={`mt-0.5 text-xs md:mt-1 md:text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {status?.originalFileName ? status.originalFileName : "Linked full course file"}
            {durationLabel ? ` · ${durationLabel}` : ""}
            {status?.sizeBytes ? ` · ${formatFileSize(status.sizeBytes)}` : ""}
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-violet-50 px-3 py-2 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-violet-950/20">
          <FiStar className="shrink-0 text-amber-500" size={14} />
          <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            Your linked file
          </span>
          <span className="text-[11px] text-amber-800/80 dark:text-amber-200/80">
            Plays exactly the MP4 you linked — duration comes from your file, not chapter totals.
          </span>
        </div>

        <button type="button" className="btn-secondary text-sm" onClick={() => navigate(-1)}>
          <FiRefreshCw size={14} />
          Back to subject
        </button>

        {loadError ? (
          <p className={`mt-2 text-xs text-rose-500 ${isDark ? "text-rose-400" : ""}`}>{loadError}</p>
        ) : null}

        {currentTime > 0 && phase === "ready" ? (
          <p className={`mt-3 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            Resume position saved at {formatClock(currentTime)}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default SubjectFullVideoPage;
