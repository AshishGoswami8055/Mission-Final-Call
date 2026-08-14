import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { jsPDF } from "jspdf";
import {
  FiArrowLeft,
  FiCamera,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiLoader,
  FiMoon,
  FiRefreshCw,
  FiStar,
  FiSun,
  FiTrash2,
} from "react-icons/fi";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import CdsPlyrPlayer from "../components/CdsPlyrPlayer";
import FullCoursePlaybackPanel from "../components/FullCoursePlaybackPanel";
import MobileCollapsibleSection from "../components/MobileCollapsibleSection";
import WatchPageHeader from "../components/WatchPageHeader";
import { useStudy } from "../context/StudyContext";
import { useTheme } from "../context/ThemeContext";
import { formatFileSize, resolveContentSrc } from "../utils/media";
import { downloadDataUrl, loadScreenshotNotes, saveScreenshotNotes } from "../utils/screenshotNotes";
import { fetchFullCourseStatus, getFullCourseStreamUrl } from "../utils/subjectFullCourse";
import { captureVideoFrameDataUrl, resolvePlyrVideoElement, seekVideoTo } from "../utils/videoScreenshot";

const PAGE_THEME_KEY = "cds_video_page_theme";
const MOBILE_PDF_PREVIEW = 5;
const MIN_RESUME_SECONDS = 5;
const SAVE_INTERVAL_SECONDS = 5;

const fullCourseNotesId = (subjectId) => `full-course-${subjectId}`;
const FULL_COURSE_POSITION_KEY = (subjectId) => `cds_full_course_position_${subjectId}`;

const formatTime = (seconds = 0) => {
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

const getImageMetaFromDataUrl = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const lower = String(dataUrl || "").toLowerCase();
      const format = lower.startsWith("data:image/png") ? "PNG" : "JPEG";
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        format,
      });
    };
    image.onerror = () => reject(new Error("Could not read screenshot image"));
    image.src = dataUrl;
  });

const SubjectFullVideoPage = () => {
  const { subjectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { addStudyMinutes, addToWatchHistory, applyVideoStreakStatus } = useStudy();

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

  const [relatedPdfs, setRelatedPdfs] = useState([]);
  const [loadingPdfs, setLoadingPdfs] = useState(false);
  const [mobilePdfShowAll, setMobilePdfShowAll] = useState(false);
  const [screenshotNotes, setScreenshotNotes] = useState([]);
  const [capturePending, setCapturePending] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const lastSavedPositionRef = useRef(0);
  const lastTickRef = useRef(null);
  const studyAccumSecondsRef = useRef(0);
  const heartbeatPendingSecondsRef = useRef(0);
  const sessionStartRef = useRef(Date.now());
  const statusRef = useRef(null);
  const resumeAppliedRef = useRef(false);
  const pendingMidPlaybackRestoreRef = useRef(0);
  const hasStartedPlayingRef = useRef(false);
  const prevVideoTimeRef = useRef(0);

  const notesId = fullCourseNotesId(subjectId);
  const subjectName = status?.subjectName || location.state?.subjectName || "Subject";

  statusRef.current = status;

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_THEME_KEY, pageDark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [pageDark]);

  const refreshStatus = useCallback(async () => {
    if (!subjectId) return null;
    const { data } = await fetchFullCourseStatus(subjectId);
    setStatus(data);
    return data;
  }, [subjectId]);

  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;

    const prepare = async () => {
      setPhase("preparing");
      setPlayerReady(false);
      setPlaybackSrc("");
      setLoadError("");
      try {
        const data = await refreshStatus();
        if (cancelled) return;

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
  }, [subjectId, refreshStatus]);

  useEffect(() => {
    if (!subjectId) return;
    let mounted = true;
    const loadNotes = async () => {
      const notes = await loadScreenshotNotes(notesId);
      if (mounted) setScreenshotNotes(notes);
    };
    void loadNotes();
    return () => {
      mounted = false;
    };
  }, [subjectId, notesId]);

  useEffect(() => {
    if (!subjectId) return;
    setLoadingPdfs(true);
    api
      .get("/contents", {
        params: {
          subjectId,
          type: "pdf",
          limit: 100,
          page: 1,
          sort: "newest",
        },
      })
      .then(({ data }) => setRelatedPdfs(data.items || []))
      .catch((error) => {
        toast.error(error.response?.data?.message || "Could not load subject PDFs");
      })
      .finally(() => setLoadingPdfs(false));
  }, [subjectId]);

  useEffect(() => {
    resumeAppliedRef.current = false;
    pendingMidPlaybackRestoreRef.current = 0;
    hasStartedPlayingRef.current = false;
    lastSavedPositionRef.current = 0;
    prevVideoTimeRef.current = 0;
  }, [subjectId, playbackSrc]);

  const syncWatchToServer = useCallback(
    async (minSeconds = 30) => {
      const seconds = heartbeatPendingSecondsRef.current;
      if (!subjectId || seconds < minSeconds) return;

      const mins = Math.max(1, Math.round(seconds / 60));
      heartbeatPendingSecondsRef.current = 0;

      try {
        const { data } = await api.post("/mission/session/heartbeat", {
          contentId: notesId,
          durationMinutes: mins,
          subjectId,
          subjectName: statusRef.current?.subjectName || subjectName,
          meta: { title: `${subjectName} — full course`, fullCourse: true },
        });
        if (data?.streak) applyVideoStreakStatus(data.streak);
      } catch {
        heartbeatPendingSecondsRef.current += seconds;
      }
    },
    [subjectId, notesId, subjectName, applyVideoStreakStatus]
  );

  useEffect(() => {
    studyAccumSecondsRef.current = 0;
    heartbeatPendingSecondsRef.current = 0;
    sessionStartRef.current = Date.now();
    lastTickRef.current = null;

    return () => {
      const mins = studyAccumSecondsRef.current / 60;
      if (mins > 0) addStudyMinutes(mins, subjectId);
      void syncWatchToServer(30);
      const video = videoRef.current;
      if (subjectId && video) {
        savePosition(subjectId, video.currentTime);
      }
      addToWatchHistory({
        contentId: notesId,
        title: `${subjectName} — full course`,
        subjectName,
        chapterName: "Full course",
        watchedAt: new Date().toISOString(),
        durationMinutes: Math.round((studyAccumSecondsRef.current || 0) / 60),
      });
    };
  }, [subjectId, notesId, subjectName, addStudyMinutes, addToWatchHistory, syncWatchToServer]);

  const tryApplyResume = useCallback(
    (video) => {
      if (!subjectId || !video) return;
      const dur = video.duration || 0;
      if (!(dur > 0)) return;

      const pendingRestore = pendingMidPlaybackRestoreRef.current;
      if (pendingRestore > MIN_RESUME_SECONDS && video.currentTime < MIN_RESUME_SECONDS) {
        pendingMidPlaybackRestoreRef.current = 0;
        void seekVideoTo(video, pendingRestore).then((ok) => {
          if (!ok || !videoRef.current) return;
          setCurrentTime(pendingRestore);
          lastSavedPositionRef.current = pendingRestore;
          prevVideoTimeRef.current = pendingRestore;
        });
        return;
      }

      const saved = loadPosition(subjectId);
      if (
        resumeAppliedRef.current ||
        saved == null ||
        !Number.isFinite(saved) ||
        saved < MIN_RESUME_SECONDS ||
        saved >= dur - MIN_RESUME_SECONDS
      ) {
        return;
      }

      void seekVideoTo(video, saved).then((ok) => {
        if (!ok || !videoRef.current) return;
        resumeAppliedRef.current = true;
        setCurrentTime(saved);
        lastSavedPositionRef.current = saved;
        prevVideoTimeRef.current = saved;
        toast.success(`Resumed from ${formatTime(saved)}`);
      });
    },
    [subjectId]
  );

  const handleVideoLoadStart = useCallback(() => {
    if (
      hasStartedPlayingRef.current &&
      lastSavedPositionRef.current > MIN_RESUME_SECONDS
    ) {
      pendingMidPlaybackRestoreRef.current = lastSavedPositionRef.current;
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setCurrentTime(t);

    const now = Date.now();
    if (lastTickRef.current != null && !video.paused && !video.ended) {
      const prev = prevVideoTimeRef.current;
      const delta = Math.max(0, Math.min(2, t - prev));
      prevVideoTimeRef.current = t;
      if (delta > 0) {
        studyAccumSecondsRef.current += delta;
        heartbeatPendingSecondsRef.current += delta;
        if (studyAccumSecondsRef.current >= 60) {
          addStudyMinutes(studyAccumSecondsRef.current / 60, subjectId);
          studyAccumSecondsRef.current = 0;
        }
        if (heartbeatPendingSecondsRef.current >= 90) {
          void syncWatchToServer(90);
        }
      }
    } else {
      prevVideoTimeRef.current = t;
    }
    lastTickRef.current = now;

    if (subjectId && t - lastSavedPositionRef.current >= SAVE_INTERVAL_SECONDS) {
      lastSavedPositionRef.current = t;
      savePosition(subjectId, t);
    }
  }, [subjectId, addStudyMinutes, syncWatchToServer]);

  const handleVideoPlay = useCallback(() => {
    hasStartedPlayingRef.current = true;
  }, []);

  const handleVideoPause = useCallback(() => {
    if (subjectId && videoRef.current) {
      const t = videoRef.current.currentTime;
      lastSavedPositionRef.current = t;
      savePosition(subjectId, t);
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
    tryApplyResume(video);
  }, [tryApplyResume]);

  const handleDurationChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const dur = Number(video.duration);
    if (Number.isFinite(dur) && dur > 0) {
      setDuration(dur);
    }
    if (!resumeAppliedRef.current) {
      tryApplyResume(video);
    }
  }, [tryApplyResume]);

  const jumpToMoment = (timecode) => {
    const parts = String(timecode).trim().split(":").map((v) => Number(v) || 0);
    let sec = parts[0] || 0;
    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
    if (Number.isNaN(sec) || sec < 0) return;
    const video = resolvePlyrVideoElement(videoRef, playerRef);
    if (!video) return;
    void seekVideoTo(video, sec).then((ok) => {
      if (ok) setCurrentTime(sec);
    });
  };

  const handleCaptureScreenshot = async () => {
    if (!subjectId) return;
    const video = resolvePlyrVideoElement(videoRef, playerRef);
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error("Video is not ready for screenshot yet.");
      return;
    }

    setCapturePending(true);
    try {
      const imageData = captureVideoFrameDataUrl(video);
      const time = Math.floor(video.currentTime || currentTime || 0);
      const note = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageData,
        time,
        title: `Note ${formatTime(time)}`,
        createdAt: new Date().toISOString(),
      };
      setScreenshotNotes((prev) => {
        const next = [note, ...prev].slice(0, 80);
        void saveScreenshotNotes(notesId, next);
        return next;
      });
      toast.success("Screenshot note saved");
    } catch (error) {
      toast.error(error?.message || "Could not capture screenshot");
    } finally {
      setCapturePending(false);
    }
  };

  const handleDeleteScreenshot = (noteId) => {
    if (!window.confirm("Delete this screenshot note?")) return;
    setScreenshotNotes((prev) => {
      const next = prev.filter((note) => note.id !== noteId);
      void saveScreenshotNotes(notesId, next);
      return next;
    });
  };

  const handleRenameScreenshot = (note) => {
    if (!note?.id) return;
    const nextTitle = window.prompt("Set note title", note.title || `Note ${formatTime(note.time)}`);
    if (nextTitle == null) return;
    const cleanTitle = String(nextTitle).trim();
    if (!cleanTitle) return;
    setScreenshotNotes((prev) => {
      const next = prev.map((item) => (item.id === note.id ? { ...item, title: cleanTitle } : item));
      void saveScreenshotNotes(notesId, next);
      return next;
    });
  };

  const handleDownloadScreenshot = (note) => {
    const noteName = String(note?.title || `note_${formatTime(note?.time || 0)}`).replace(/[^a-z0-9-_]/gi, "_");
    downloadDataUrl(note.imageData, `${subjectName.replace(/[^a-z0-9-_]/gi, "_")}_${noteName}.png`);
  };

  const handleDownloadAllScreenshotsPdf = async () => {
    if (!screenshotNotes.length) {
      toast.error("No screenshot notes available.");
      return;
    }

    setExportingPdf(true);
    try {
      const ordered = [...screenshotNotes].sort((a, b) => (a.time || 0) - (b.time || 0));
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
        compress: true,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let index = 0; index < ordered.length; index += 1) {
        const note = ordered[index];
        if (index > 0) pdf.addPage("a4", "landscape");

        const title = String(note.title || `Note ${formatTime(note.time || 0)}`);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        pdf.text(title, 36, 36);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(80, 80, 80);
        pdf.text(`Timestamp: ${formatTime(note.time || 0)}`, 36, 56);
        pdf.text(`Video: ${subjectName} — full course`, 36, 72);

        const { width, height, format } = await getImageMetaFromDataUrl(note.imageData);
        const maxW = pageWidth - 72;
        const maxH = pageHeight - 120;
        const scale = Math.min(maxW / width, maxH / height);
        const drawW = width * scale;
        const drawH = height * scale;
        const x = (pageWidth - drawW) / 2;
        const y = 90 + (maxH - drawH) / 2;

        pdf.addImage(note.imageData, format, x, y, drawW, drawH, undefined, "FAST");
      }

      pdf.save(`${subjectName.replace(/[^a-z0-9-_]/gi, "_")}_full_course_notes.pdf`);
      toast.success("Screenshot notes PDF downloaded");
    } catch {
      toast.error("Could not export PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  const durationLabel = duration > 0 ? formatTime(duration) : "";
  // Scrub preview needs fast local seeks — disable on large HTTP range streams.
  const scrubPreviewEnabled = false;

  return (
    <div
      className={`page-viewer page-viewer--watch ${
        isDark ? "page-viewer--dark text-slate-100" : "text-slate-800"
      }`}
    >
      <WatchPageHeader
        isDark={isDark}
        onToggleTheme={() => setPageDark((value) => !value)}
        subjects={subjectId ? [{ _id: subjectId, name: subjectName }] : []}
      />

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
              Go back to the subject and use <strong>Choose video</strong> to link your edited MP4.
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
          <div ref={playerRef} className="cds-plyr-shell group relative aspect-video w-full overflow-hidden bg-black">
            <CdsPlyrPlayer
              key={`full-course-${subjectId}-${playbackSrc}`}
              contentId={notesId}
              src={playbackSrc}
              ready={playerReady}
              videoRef={videoRef}
              videoPreload="metadata"
              crossOriginMode="auto"
              scrubPreviewEnabled={scrubPreviewEnabled}
              onScreenshot={handleCaptureScreenshot}
              onLoadStart={handleVideoLoadStart}
              onLoadedMetadata={handleLoadedMetadata}
              onDurationChange={handleDurationChange}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handleVideoPlay}
              onPause={handleVideoPause}
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
          <p className={`mt-0.5 line-clamp-2 text-xs md:mt-1 md:text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {status?.originalFileName ? status.originalFileName : "Linked full course file"}
            {durationLabel ? ` · ${durationLabel}` : ""}
            {status?.sizeBytes ? ` · ${formatFileSize(status.sizeBytes)}` : ""}
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-violet-50 px-3 py-2 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-violet-950/20">
          <FiStar className="shrink-0 text-amber-500" size={14} />
          <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">Your linked file</span>
          <span className="text-[11px] text-amber-800/80 dark:text-amber-200/80">
            Plays exactly the MP4 you linked — duration comes from your file, not chapter totals.
          </span>
        </div>

        <MobileCollapsibleSection
          key={`tools-${subjectId}`}
          title="Playback tools"
          subtitle="Linked file & cinema playback"
          defaultOpen
          isDark={isDark}
        >
          <FullCoursePlaybackPanel
            subjectId={subjectId}
            status={status}
            isDark={isDark}
            onRefresh={refreshStatus}
          />
        </MobileCollapsibleSection>

        <MobileCollapsibleSection
          key={`pdfs-${subjectId}`}
          title="Subject PDFs"
          subtitle={
            relatedPdfs.length
              ? `${relatedPdfs.length} document${relatedPdfs.length === 1 ? "" : "s"} in this subject`
              : "No PDFs in this subject"
          }
          badge={relatedPdfs.length ? String(relatedPdfs.length) : ""}
          defaultOpen={relatedPdfs.length > 0 && relatedPdfs.length <= 3}
          isDark={isDark}
        >
          <div className="flex flex-col gap-2">
            {loadingPdfs && (
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Loading PDFs…</p>
            )}
            {!loadingPdfs && !relatedPdfs.length && (
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                No PDF found in this subject yet.
              </p>
            )}
            <div className="flex flex-col gap-2 md:hidden">
              {(mobilePdfShowAll ? relatedPdfs : relatedPdfs.slice(0, MOBILE_PDF_PREVIEW)).map((pdf) => {
                const pdfSrc = resolveContentSrc(pdf);
                return (
                  <a
                    key={pdf._id}
                    href={pdfSrc}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition active:scale-[0.99] ${
                      isDark
                        ? "border-neutral-700 bg-neutral-900 text-slate-200 hover:bg-neutral-800"
                        : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
                    }`}
                    title={pdf.title}
                  >
                    <FiFileText size={14} className="shrink-0" />
                    <span className="min-w-0 truncate">{pdf.title}</span>
                  </a>
                );
              })}
              {!mobilePdfShowAll && relatedPdfs.length > MOBILE_PDF_PREVIEW && (
                <button
                  type="button"
                  className="btn-ghost w-full text-xs"
                  onClick={() => setMobilePdfShowAll(true)}
                >
                  Show all {relatedPdfs.length} PDFs
                </button>
              )}
            </div>
            <div className="hidden flex-wrap gap-2 md:flex">
              {relatedPdfs.map((pdf) => {
                const pdfSrc = resolveContentSrc(pdf);
                return (
                  <a
                    key={pdf._id}
                    href={pdfSrc}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${
                      isDark
                        ? "border-neutral-700 bg-neutral-900 text-slate-200 hover:bg-neutral-800"
                        : "border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                    }`}
                    title={pdf.title}
                  >
                    <FiFileText size={12} />
                    <span className="max-w-52 truncate">{pdf.title}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </MobileCollapsibleSection>

        <MobileCollapsibleSection
          key={`notes-${subjectId}`}
          title="Screenshot notes"
          subtitle={
            screenshotNotes.length
              ? `${screenshotNotes.length} saved frame${screenshotNotes.length === 1 ? "" : "s"}`
              : "Capture frames while watching"
          }
          badge={screenshotNotes.length ? String(screenshotNotes.length) : ""}
          defaultOpen={screenshotNotes.length > 0}
          isDark={isDark}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between md:mb-1">
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                className="btn-secondary flex-1 text-xs sm:flex-none"
                onClick={() => void handleCaptureScreenshot()}
                disabled={capturePending || phase !== "ready"}
              >
                <FiCamera size={13} />
                {capturePending ? "Saving…" : "Capture"}
              </button>
              <button
                type="button"
                className="btn-secondary flex-1 text-xs sm:flex-none"
                onClick={() => void handleDownloadAllScreenshotsPdf()}
                disabled={exportingPdf || !screenshotNotes.length}
              >
                <FiDownload size={13} />
                {exportingPdf ? "PDF…" : "Export PDF"}
              </button>
            </div>
          </div>
          <p className={`mt-2 hidden text-xs md:block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Capture key frames while watching. Tap a timestamp to jump in the video.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!screenshotNotes.length && (
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                No screenshot notes yet.
              </p>
            )}
            {screenshotNotes.map((note) => (
              <article
                key={note.id}
                className={`overflow-hidden rounded-lg border ${
                  isDark ? "border-neutral-700 bg-neutral-900" : "border-slate-200 bg-white"
                }`}
              >
                <a
                  href={`/video/${notesId}/screenshot/${note.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full"
                  title="Open screenshot in new tab"
                >
                  <img
                    src={note.imageData}
                    alt={`Screenshot note at ${formatTime(note.time)}`}
                    className="aspect-video w-full object-cover"
                  />
                </a>
                <div className="space-y-2 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`truncate text-sm font-semibold ${
                        isDark ? "text-slate-100" : "text-slate-800"
                      }`}
                      title={note.title || `Note ${formatTime(note.time)}`}
                    >
                      {note.title || `Note ${formatTime(note.time)}`}
                    </p>
                    <button
                      type="button"
                      className={`rounded p-1.5 transition ${
                        isDark
                          ? "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      }`}
                      onClick={() => handleRenameScreenshot(note)}
                      title="Rename note"
                    >
                      <FiEdit2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className={`rounded px-2 py-1 font-medium transition ${
                        isDark
                          ? "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
                          : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      }`}
                      onClick={() => jumpToMoment(formatTime(note.time))}
                      title="Go to timestamp"
                    >
                      {formatTime(note.time)}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className={`rounded p-1.5 transition ${
                          isDark
                            ? "text-blue-300 hover:bg-blue-900/20"
                            : "text-blue-600 hover:bg-blue-50"
                        }`}
                        onClick={() => handleDownloadScreenshot(note)}
                        title="Download screenshot"
                      >
                        <FiDownload size={14} />
                      </button>
                      <button
                        type="button"
                        className={`rounded p-1.5 transition ${
                          isDark
                            ? "text-rose-300 hover:bg-rose-900/20"
                            : "text-rose-500 hover:bg-rose-50"
                        }`}
                        onClick={() => handleDeleteScreenshot(note.id)}
                        title="Delete note"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </MobileCollapsibleSection>

        <button type="button" className="btn-secondary mt-2 text-sm" onClick={() => navigate(-1)}>
          <FiRefreshCw size={14} />
          Back to subject
        </button>

        {loadError ? (
          <p className={`mt-2 text-xs text-rose-500 ${isDark ? "text-rose-400" : ""}`}>{loadError}</p>
        ) : null}
      </div>
    </div>
  );
};

export default SubjectFullVideoPage;
