import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowLeft, FiDownload, FiLoader, FiMoon, FiStar, FiSun } from "react-icons/fi";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import CdsPlyrPlayer from "../components/CdsPlyrPlayer";
import VirtualFullCoursePlayer from "../components/VirtualFullCoursePlayer";
import StudyTracker from "../components/StudyTracker";
import VideoStreakBadge from "../components/streak/VideoStreakBadge";
import { useTheme } from "../context/ThemeContext";
import { formatDuration, formatFileSize, isLocalFrontend } from "../utils/media";
import {
  downloadSubjectMergedVideo,
  getMergedVideoStreamUrl,
} from "../utils/subjectPlayAll";

const MERGED_POSITION_KEY = (subjectId) => `cds_merged_video_position_${subjectId}`;
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

const saveMergedPosition = (subjectId, currentTime) => {
  if (!subjectId || currentTime == null) return;
  try {
    localStorage.setItem(MERGED_POSITION_KEY(subjectId), String(currentTime));
  } catch {
    /* ignore */
  }
};

const loadMergedPosition = (subjectId) => {
  if (!subjectId) return null;
  try {
    const value = localStorage.getItem(MERGED_POSITION_KEY(subjectId));
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
  const [progressMessage, setProgressMessage] = useState("Preparing full course video…");
  const [progressPercent, setProgressPercent] = useState(0);
  const [status, setStatus] = useState(null);
  const [playbackSrc, setPlaybackSrc] = useState("");
  const [playerReady, setPlayerReady] = useState(false);
  const [playerMode, setPlayerMode] = useState("merged");
  const [playlist, setPlaylist] = useState(null);
  const [missingChapters, setMissingChapters] = useState([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const videoRef = useRef(null);
  const lastSavedRef = useRef(0);

  const subjectName = status?.subjectName || location.state?.subjectName || "Subject";
  const videoCount = status?.videoCount || location.state?.videoCount || 0;
  const isLocal = isLocalFrontend();
  const partsReady = status?.partsReady ?? status?.pcLibraryReady ?? 0;
  const partsTotalCount = status?.partsTotal || videoCount;
  const hintedDuration = Number(status?.totalDurationSeconds) || 0;

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
      setPlaylist(null);
      setMissingChapters([]);
      setPlayerMode("merged");
      try {
        const [statusRes, playlistRes] = await Promise.all([
          api.get(`/subjects/${subjectId}/merged-video`),
          api.get(`/subjects/${subjectId}/full-video/playlist`),
        ]);
        if (cancelled) return;

        setStatus(statusRes.data);

        if (statusRes.data?.ready) {
          setPlaybackSrc(getMergedVideoStreamUrl(subjectId));
          setPhase("ready");
          setPlayerMode("merged");
          setPlayerReady(true);
          if (statusRes.data?.totalDurationSeconds > 0) {
            setDuration(statusRes.data.totalDurationSeconds);
          }
          return;
        }

        const playlistData = playlistRes.data;
        if (playlistData?.canPlayInstantly) {
          setPlaylist(playlistData);
          setPhase("ready");
          setPlayerMode("virtual");
          setPlayerReady(true);
          if (playlistData.totalDurationSeconds > 0) {
            setDuration(playlistData.totalDurationSeconds);
          }
          return;
        }

        const missing = (playlistData?.chapters || []).filter((chapter) => !chapter.playUrl);
        setMissingChapters(missing);
        setPhase("missing");
        setProgressMessage(
          missing.length
            ? `${missing.length} chapter${missing.length === 1 ? "" : "s"} still need Download or Replace on your PC`
            : "Some chapters are not ready yet"
        );
      } catch (error) {
        if (cancelled) return;
        setPhase("error");
        toast.error(error.response?.data?.message || error.message || "Could not prepare full course video");
      }
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  useEffect(() => {
    if (!subjectId || !playerReady || playerMode !== "merged" || !videoRef.current) return;
    const saved = loadMergedPosition(subjectId);
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
  }, [subjectId, playerReady, playerMode, playbackSrc]);

  const handleVirtualTimeSave = useCallback(
    (time) => {
      lastSavedRef.current = time;
      saveMergedPosition(subjectId, time);
    },
    [subjectId]
  );

  const handleVirtualTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    const delta = Math.abs(video.currentTime - lastSavedRef.current);
    if (delta >= 5) {
      lastSavedRef.current = video.currentTime;
      saveMergedPosition(subjectId, video.currentTime);
    }
  }, [subjectId]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const dur = Number(video.duration);
    if (Number.isFinite(dur) && dur > 0) {
      setDuration(dur);
    } else if (hintedDuration > 0) {
      setDuration(hintedDuration);
    }
  }, [hintedDuration]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadSubjectMergedVideo(subjectId, {
        onProgress: (data) => {
          setProgressMessage(data.message || "Preparing download…");
        },
      });
      toast.success("Full course download started");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [downloading, subjectId]);

  const durationLabel =
    duration > 0 ? formatClock(duration) : hintedDuration > 0 ? formatDuration(hintedDuration) : "";

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

        {phase === "preparing" || phase === "downloading" ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
            <FiLoader className="animate-spin text-3xl text-teal-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">{progressMessage}</p>
              <p className="text-xs text-slate-400">
                {phase === "stitching"
                  ? "Joining chapter files — usually 2–10 minutes if all chapters use the same MP4 format."
                  : isLocal
                    ? "Uses Download/Replace files from your PC. Missing chapters are fetched from Telegram."
                    : "Step 1 downloads chapters, step 2 stitches them."}
              </p>
            </div>
            {progressPercent > 0 ? (
              <div className="w-full max-w-xs">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all"
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{progressPercent}%</p>
              </div>
            ) : null}
          </div>
        ) : phase === "stitching" ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
            <FiLoader className="animate-spin text-3xl text-violet-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">{progressMessage}</p>
              <p className="text-xs text-slate-400">
                Joining chapter files — usually 2–10 minutes if chapters share the same MP4 format. Re-encoding can take hours.
              </p>
            </div>
            {progressPercent > 0 ? (
              <div className="w-full max-w-xs">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all"
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{progressPercent}%</p>
              </div>
            ) : null}
          </div>
        ) : phase === "missing" ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
            <p className="text-sm font-medium text-white">{progressMessage}</p>
            <p className="max-w-md text-xs text-slate-400">
              Open each lesson and use <strong>Download</strong> or <strong>Replace</strong> so the app can find the file on your PC.
              Play full course starts instantly once all chapters are linked — no long merge wait.
            </p>
            {missingChapters.length ? (
              <ul className="max-h-40 w-full max-w-md overflow-y-auto text-left text-xs text-slate-300">
                {missingChapters.slice(0, 8).map((chapter) => (
                  <li key={chapter.contentId} className="border-b border-white/5 py-1.5">
                    {chapter.order}. {chapter.title}
                  </li>
                ))}
                {missingChapters.length > 8 ? (
                  <li className="py-1.5 text-slate-500">+ {missingChapters.length - 8} more</li>
                ) : null}
              </ul>
            ) : null}
            <button type="button" className="btn-secondary text-sm" onClick={() => navigate(0)}>
              Refresh after linking files
            </button>
          </div>
        ) : phase === "error" ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center">
            <p className="text-sm font-medium text-white">Could not prepare full course video</p>
            <button type="button" className="btn-secondary text-sm" onClick={() => navigate(0)}>
              Try again
            </button>
          </div>
        ) : playerMode === "virtual" && playlist?.chapters?.length ? (
          <VirtualFullCoursePlayer
            subjectId={subjectId}
            chapters={playlist.chapters}
            initialGlobalTime={loadMergedPosition(subjectId) || 0}
            videoRef={videoRef}
            onGlobalTimeUpdate={handleVirtualTimeUpdate}
            onGlobalTimeSave={handleVirtualTimeSave}
          />
        ) : (
          <div className="cds-plyr-shell group relative aspect-video w-full overflow-hidden bg-black">
            <CdsPlyrPlayer
              key={`merged-${subjectId}`}
              contentId={`merged-${subjectId}`}
              src={playbackSrc}
              ready={playerReady}
              videoRef={videoRef}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              scrubPreviewEnabled={Boolean(playbackSrc && phase === "ready" && playerMode === "merged")}
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
            {videoCount > 0 ? `${videoCount} chapters combined` : "All chapters combined"}
            {isLocal && partsTotalCount > 0 ? ` · ${partsReady}/${partsTotalCount} chapters ready` : ""}
            {durationLabel ? ` · ${durationLabel}` : ""}
            {status?.sizeBytes ? ` · ${formatFileSize(status.sizeBytes)}` : ""}
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-violet-50 px-3 py-2 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-violet-950/20">
          <FiStar className="shrink-0 text-amber-500" size={14} />
          <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            One continuous video
          </span>
          <span className="text-[11px] text-amber-800/80 dark:text-amber-200/80">
            {playerMode === "virtual"
              ? "Chapters play back-to-back from your PC — scrub the timeline below. Download full video still builds one MP4 file."
              : `All chapters play as a single ${durationLabel || "long"} file — scrub anywhere on the timeline.`}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={phase !== "ready" || downloading}
            onClick={() => void handleDownload()}
          >
            {downloading ? <FiLoader size={14} className="animate-spin" /> : <FiDownload size={14} />}
            Download full video
          </button>
        </div>

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
