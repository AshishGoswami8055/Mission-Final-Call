import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { jsPDF } from "jspdf";
import {
  FiArrowLeft,
  FiCamera,
  FiClock,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiMoon,
  FiLoader,
  FiRefreshCw,
  FiSun,
  FiTrash2,
} from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import { useTelegramPlaybackStatus } from "../hooks/useTelegramPlaybackStatus";
import MobileCollapsibleSection from "../components/MobileCollapsibleSection";
import StudyTracker from "../components/StudyTracker";
import CdsPlyrPlayer from "../components/CdsPlyrPlayer";
import TelegramConnectionStatus from "../components/TelegramConnectionStatus";
import VideoStreakBadge from "../components/streak/VideoStreakBadge";
import SmoothPlaybackPanel from "../components/SmoothPlaybackPanel";
import VideoPlaybackCachePanel from "../components/VideoPlaybackCachePanel";
import { useStudy } from "../context/StudyContext";
import { useTheme } from "../context/ThemeContext";
import { getTelegramVideoUrl, isLocalFrontend, isTelegramLinkVideo, isTelegramStreamContent, isYouTubeUrl, preferSameOriginMediaUrl, resolveContentSrc, resolveVideoPlaybackUrl, toAbsoluteMediaUrl } from "../utils/media";
import { captureVideoFrameDataUrl, resolvePlyrVideoElement } from "../utils/videoScreenshot";
import { fetchLocalLibraryStatus } from "../utils/localLibraryApi";
import { downloadDataUrl, loadScreenshotNotes, saveScreenshotNotes } from "../utils/screenshotNotes";
import { getYouTubeThumbnailDataUrl } from "../utils/youtubeThumbnail";

const VIDEO_POSITION_KEY = (contentId) => `cds_video_position_${contentId}`;
const VIDEO_PAGE_THEME_KEY = "cds_video_page_theme";
const MIN_RESUME_SECONDS = 5;
const SAVE_INTERVAL_SECONDS = 5;
const MOBILE_PDF_PREVIEW = 5;

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

const saveVideoPosition = (contentId, currentTime) => {
  if (!contentId || currentTime == null) return;
  try {
    localStorage.setItem(VIDEO_POSITION_KEY(contentId), String(currentTime));
  } catch {}
};

const loadVideoPosition = (contentId) => {
  if (!contentId) return null;
  try {
    const v = localStorage.getItem(VIDEO_POSITION_KEY(contentId));
    return v != null ? parseFloat(v, 10) : null;
  } catch {
    return null;
  }
};

const parseTimecodeToSeconds = (timecode = "") => {
  const parts = String(timecode).trim().split(":").map((v) => Number(v) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
};

const buildYoutubeWatchUrl = (rawUrl, seconds = 0) => {
  const sec = Math.max(0, Math.floor(seconds));
  if (!rawUrl) return "";
  if (sec <= 0) return rawUrl;
  const joiner = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${joiner}t=${sec}`;
};

const extractYoutubeVideoId = (rawUrl) => {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").split("/")[0] || "";
    }
    return u.searchParams.get("v") || "";
  } catch {
    return rawUrl.split("/").pop()?.split("?")[0] || "";
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

const VideoPlayerPage = () => {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [relatedPdfs, setRelatedPdfs] = useState([]);
  const [loadingPdfs, setLoadingPdfs] = useState(false);
  const [, setIsPlaying] = useState(false);
  const { theme } = useTheme();
  const [pageDark, setPageDark] = useState(() => {
    try {
      const saved = localStorage.getItem(VIDEO_PAGE_THEME_KEY);
      if (saved === "dark") return true;
      if (saved === "light") return false;
    } catch {}
    return theme === "dark";
  });
  const isDark = pageDark;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferPercent, setBufferPercent] = useState(0);
  const [loadElapsedSec, setLoadElapsedSec] = useState(0);
  const loadStartedAtRef = useRef(null);
  const [capturePending, setCapturePending] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [screenshotNotes, setScreenshotNotes] = useState([]);
  const [cachedPlayUrl, setCachedPlayUrl] = useState(null);
  const [playbackSourceReady, setPlaybackSourceReady] = useState(false);
  const [playerGeneration, setPlayerGeneration] = useState(0);
  const [playbackStalled, setPlaybackStalled] = useState(false);
  const [mobilePdfShowAll, setMobilePdfShowAll] = useState(false);
  const usingCacheRef = useRef(false);
  const usingLocalLibraryRef = useRef(false);
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const handleCaptureRef = useRef(() => {});
  const cachedPlayUrlRef = useRef(null);
  const addStudyMinutesRef = useRef(() => {});
  const handlePlaybackEndedRef = useRef(async () => {});
  const lastSavedPositionRef = useRef(0);
  const studyAccumSecondsRef = useRef(0);
  const heartbeatPendingSecondsRef = useRef(0);
  const sessionStartRef = useRef(Date.now());
  const itemRef = useRef(null);
  const prevVideoTimeRef = useRef(0);
  const syncWatchToServerRef = useRef(async () => {});
  const { addStudyMinutes, addToWatchHistory, applyVideoStreakStatus } = useStudy();

  const isTelegramStream = item ? isTelegramStreamContent(item) : false;
  const isTelegramLink = item ? isTelegramLinkVideo(item) : false;
  const telegramLink = item ? getTelegramVideoUrl(item) : "";
  const rawSrc = item ? resolveContentSrc(item) : "";
  const isYoutube = !isTelegramLink && !isTelegramStream && isYouTubeUrl(rawSrc);
  const canCachePlayback = Boolean(
    item &&
      (isTelegramStream ||
        item.sourceType === "cloudinary" ||
        (item.sourceType === "upload" && item.filePath))
  );
  const src = isTelegramLink || isYoutube ? "" : preferSameOriginMediaUrl(rawSrc);
  const playbackSrc = cachedPlayUrl ? resolveVideoPlaybackUrl(cachedPlayUrl) : src;

  const {
    telegramStatus,
    telegramStatusResetting,
    refreshTelegramStatus,
    handleResetTelegramSession,
    verifyTelegramForRetry,
  } = useTelegramPlaybackStatus({ item, itemRef, isTelegramStream });

  const youtubeVideoId = isYoutube ? extractYoutubeVideoId(rawSrc) : "";
  const youtubeThumb =
    item?.thumbnail ||
    (youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : "");

  const hintedDuration = Number(item?.duration) || 0;
  const hasVideoDuration = duration > 0 && Number.isFinite(duration);
  const showInitialLoader = Boolean(playbackSrc) && !hasVideoDuration && !isTelegramStream && !cachedPlayUrl;
  const telegramBlocksStream =
    isTelegramStream && !cachedPlayUrl && !telegramStatus.checking && !telegramStatus.live;
  const showTelegramStreamLoader =
    isTelegramStream &&
    !cachedPlayUrl &&
    Boolean(playbackSrc) &&
    playbackSourceReady &&
    !telegramBlocksStream &&
    (!hasVideoDuration || playbackStalled);
  const showStreamLoadingOverlay = showInitialLoader || showTelegramStreamLoader;
  const showNativePlayer = !isTelegramLink && !isYoutube;
  const showLibraryCheckOverlay =
    showNativePlayer && !playbackSourceReady && isLocalFrontend() && isTelegramStream && canCachePlayback;

  const applyVideoDuration = useCallback((video) => {
    const dur = Number(video?.duration);
    if (Number.isFinite(dur) && dur > 0) {
      setDuration(dur);
      return true;
    }
    const hint = Number(itemRef.current?.duration) || 0;
    if (hint > 0) {
      setDuration(hint);
      return true;
    }
    return false;
  }, []);

  const updateBufferProgress = useCallback((video) => {
    if (!video) return;
    const dur =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : Number(itemRef.current?.duration) || 0;
    if (!dur) {
      setBufferPercent(0);
      return;
    }
    if (video.buffered.length > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      setBufferPercent(Math.min(100, Math.round((end / dur) * 100)));
    }
  }, []);

  useEffect(() => {
    if (!playbackSrc) {
      setBufferPercent(0);
      return;
    }
    setBufferPercent(0);
    setLoadElapsedSec(0);
    setDuration(isTelegramStream && hintedDuration > 0 && !cachedPlayUrl ? hintedDuration : 0);
    setCurrentTime(0);
    loadStartedAtRef.current = Date.now();
  }, [playbackSrc, id, isTelegramStream, hintedDuration, cachedPlayUrl]);

  useEffect(() => {
    let cancelled = false;
    setPlaybackSourceReady(false);
    setCachedPlayUrl(null);
    usingCacheRef.current = false;
    usingLocalLibraryRef.current = false;

    const resolvePlaybackSource = async () => {
      if (isLocalFrontend() && id && canCachePlayback) {
        try {
          const { data } = await fetchLocalLibraryStatus(id);
          if (!cancelled && data.cached && data.ready && data.playUrl) {
            setCachedPlayUrl(data.playUrl);
            usingLocalLibraryRef.current = true;
            usingCacheRef.current = true;
          }
        } catch {
          /* fall back to stream */
        }
      }
      if (!cancelled) setPlaybackSourceReady(true);
    };

    void resolvePlaybackSource();
    return () => {
      cancelled = true;
    };
  }, [id, canCachePlayback]);

  useEffect(() => {
    setPlayerGeneration(0);
    setPlaybackStalled(false);
    setMobilePdfShowAll(false);
  }, [id]);

  const handleRetryPlayback = useCallback(async () => {
    setPlaybackStalled(false);
    setBufferPercent(0);
    setLoadElapsedSec(0);
    loadStartedAtRef.current = Date.now();
    if (isTelegramStream) {
      await verifyTelegramForRetry();
    }
    setPlayerGeneration((value) => value + 1);
  }, [isTelegramStream, verifyTelegramForRetry]);

  const handlePlaybackEnded = useCallback(async () => {
    setIsPlaying(false);
    if (id && videoRef.current) {
      saveVideoPosition(id, videoRef.current.currentTime);
    }
    if (usingCacheRef.current && !usingLocalLibraryRef.current && id) {
      try {
        await api.delete(`/contents/${id}/playback-cache`);
        setCachedPlayUrl(null);
        usingCacheRef.current = false;
        toast.success("Cached copy removed after watching.");
      } catch {
        /* non-blocking */
      }
    }
  }, [id]);

  const handleVideoLoadStart = useCallback(() => {
    setBufferPercent(0);
    loadStartedAtRef.current = Date.now();
    const hint = Number(itemRef.current?.duration) || 0;
    const telegram = itemRef.current ? isTelegramStreamContent(itemRef.current) : false;
    if (!telegram || hint <= 0) setDuration(0);
  }, []);

  const handleVideoLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setPlaybackStalled(false);
    applyVideoDuration(video);
    updateBufferProgress(video);
    const dur = video.duration || 0;
    if (!id || !(dur > 0)) return;
    const saved = loadVideoPosition(id);
    if (
      saved != null &&
      Number.isFinite(saved) &&
      saved >= MIN_RESUME_SECONDS &&
      saved < dur - MIN_RESUME_SECONDS
    ) {
      video.currentTime = saved;
      setCurrentTime(saved);
      lastSavedPositionRef.current = saved;
      toast.success(`Resumed from ${formatTime(saved)}`);
    }
  }, [applyVideoDuration, id, updateBufferProgress]);

  const handleVideoDurationChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    applyVideoDuration(video);
    updateBufferProgress(video);
  }, [applyVideoDuration, updateBufferProgress]);

  const handleVideoProgress = useCallback(() => {
    updateBufferProgress(videoRef.current);
  }, [updateBufferProgress]);

  const handleVideoError = useCallback(() => {
    const tryLocalFallback = async () => {
      const currentItem = itemRef.current;
      const telegram = currentItem ? isTelegramStreamContent(currentItem) : false;

      if (usingLocalLibraryRef.current || cachedPlayUrlRef.current) {
        toast.error("Local video file failed to load.");
        return;
      }
      if (!isLocalFrontend() || !canCachePlayback || !id) {
        if (telegram) {
          toast.error(
            "Telegram video failed to load. Open Import from Telegram, confirm the server is connected, then retry.",
            { duration: 9000 }
          );
        } else {
          toast.error("Video failed to load. Please refresh the page and try again.");
        }
        return;
      }
      try {
        const { data } = await fetchLocalLibraryStatus(id);
        if (data.cached && data.ready && data.playUrl) {
          setCachedPlayUrl(data.playUrl);
          usingLocalLibraryRef.current = true;
          usingCacheRef.current = true;
          toast.success("Playing from your PC library.");
          return;
        }
        if (data.job?.status === "downloading") {
          toast.error(
            "This video is still downloading to your PC library. Wait for it to finish, then refresh."
          );
          return;
        }
      } catch {
        /* ignore */
      }
      toast.error(
        "Telegram stream failed. Re-login to Telegram in Settings, restart the server, wait 30 seconds, then refresh. Or click Smooth playback to save this video to your PC first.",
        { duration: 10000 }
      );
    };
    void tryLocalFallback();
  }, [canCachePlayback, id]);

  const handleVideoTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setCurrentTime(t);
    if (video.paused) return;
    const prev = prevVideoTimeRef.current;
    const delta = Math.max(0, Math.min(2, t - prev));
    prevVideoTimeRef.current = t;
    studyAccumSecondsRef.current += delta;
    heartbeatPendingSecondsRef.current += delta;
    if (studyAccumSecondsRef.current >= 60) {
      const sid = itemRef.current?.subjectId?._id ?? itemRef.current?.subjectId;
      addStudyMinutesRef.current(studyAccumSecondsRef.current / 60, sid);
      studyAccumSecondsRef.current = 0;
    }
    if (heartbeatPendingSecondsRef.current >= 300) void syncWatchToServerRef.current(300);
    if (id && t - lastSavedPositionRef.current >= SAVE_INTERVAL_SECONDS) {
      lastSavedPositionRef.current = t;
      saveVideoPosition(id, t);
    }
  }, [id]);

  const handleVideoPlay = useCallback(() => setIsPlaying(true), []);

  const handleVideoPause = useCallback(() => {
    setIsPlaying(false);
    if (id && videoRef.current) saveVideoPosition(id, videoRef.current.currentTime);
  }, [id]);

  const handleVideoEnded = useCallback(() => {
    void handlePlaybackEndedRef.current();
  }, []);

  const handleVideoStalled = useCallback(({ gaveUp }) => {
    if (gaveUp) {
      setPlaybackStalled(true);
      toast.error("Video stalled. Check Telegram connection below, then retry playback.", { duration: 8000 });
    }
  }, []);

  useEffect(() => {
    if (!showStreamLoadingOverlay) {
      loadStartedAtRef.current = null;
      return undefined;
    }
    setLoadElapsedSec(
      loadStartedAtRef.current
        ? Math.floor((Date.now() - loadStartedAtRef.current) / 1000)
        : 0
    );
    const interval = setInterval(() => {
      if (!loadStartedAtRef.current) return;
      setLoadElapsedSec(Math.floor((Date.now() - loadStartedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [showStreamLoadingOverlay]);

  useEffect(() => {
    try {
      localStorage.setItem(VIDEO_PAGE_THEME_KEY, pageDark ? "dark" : "light");
    } catch {}
  }, [pageDark]);

  useEffect(() => {
    return () => {
      const contentId = itemRef.current?._id;
      const video = videoRef.current;
      if (contentId && video && !isYouTubeUrl(resolveContentSrc(itemRef.current))) {
        saveVideoPosition(contentId, video.currentTime);
      }
    };
  }, [id]);

  itemRef.current = item;

  const syncWatchToServer = useCallback(
    async (minSeconds = 30) => {
      const currentItem = itemRef.current;
      const seconds = heartbeatPendingSecondsRef.current;
      if (!currentItem?._id || seconds < minSeconds) return;

      const mins = Math.max(1, Math.round(seconds / 60));
      heartbeatPendingSecondsRef.current = 0;

      try {
        const subjectId = currentItem.subjectId?._id ?? currentItem.subjectId;
        const { data } = await api.post("/mission/session/heartbeat", {
          contentId: currentItem._id,
          durationMinutes: mins,
          subjectId,
          subjectName: currentItem.subjectId?.name || "",
          meta: { title: currentItem.title },
        });
        if (data?.streak) applyVideoStreakStatus(data.streak);
      } catch {
        heartbeatPendingSecondsRef.current += seconds;
      }
    },
    [applyVideoStreakStatus]
  );

  syncWatchToServerRef.current = syncWatchToServer;

  useEffect(() => {
    heartbeatPendingSecondsRef.current = 0;
    studyAccumSecondsRef.current = 0;
    sessionStartRef.current = Date.now();
    return () => {
      const currentItem = itemRef.current;
      const mins = studyAccumSecondsRef.current / 60;
      const subjectId = currentItem?.subjectId?._id ?? currentItem?.subjectId;
      if (mins > 0) addStudyMinutes(mins, subjectId);
      void syncWatchToServerRef.current(30);
      if (currentItem) {
        addToWatchHistory({
          contentId: currentItem._id,
          title: currentItem.title,
          subjectName: currentItem.subjectId?.name,
          chapterName: currentItem.chapterId?.chapterName,
          watchedAt: new Date().toISOString(),
          durationMinutes: Math.round((studyAccumSecondsRef.current || 0) / 60),
        });
      }
      const resolved = resolveContentSrc(currentItem);
      const isYt = isYouTubeUrl(resolved);
      const isTgLink = isTelegramLinkVideo(currentItem);
      if ((isYt || isTgLink) && currentItem) {
        const sessionMinutes = (Date.now() - sessionStartRef.current) / 60000;
        if (sessionMinutes > 0 && sessionMinutes <= 240) addStudyMinutes(Math.min(sessionMinutes, 120), subjectId);
      }
    };
  }, [id, addStudyMinutes, addToWatchHistory]);

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const { data } = await api.get(`/contents/${id}`);
        setItem(data);
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not load video");
      }
    };
    fetchItem();
  }, [id]);

  useEffect(() => {
    let mounted = true;
    const loadNotes = async () => {
      const notes = await loadScreenshotNotes(id);
      if (mounted) setScreenshotNotes(notes);
    };
    loadNotes();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    const fetchRelatedPdfs = async () => {
      if (!item?.chapterId?._id) return;
      setLoadingPdfs(true);
      try {
        const { data } = await api.get("/contents", {
          params: {
            chapterId: item.chapterId._id,
            type: "pdf",
            limit: 100,
            page: 1,
            sort: "newest",
          },
        });
        setRelatedPdfs(data.items || []);
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not load related PDFs");
      } finally {
        setLoadingPdfs(false);
      }
    };
    fetchRelatedPdfs();
  }, [item?.chapterId?._id]);

  const jumpToMoment = (timecode) => {
    const sec = parseTimecodeToSeconds(timecode);
    if (Number.isNaN(sec) || sec < 0) return;
    if (!isYoutube && !isTelegramLink && videoRef.current) {
      videoRef.current.currentTime = sec;
      setCurrentTime(sec);
      return;
    }
    if (isTelegramLink) {
      setCurrentTime(sec);
      window.open(telegramLink, "_blank", "noopener,noreferrer");
      return;
    }
    if (isYoutube) {
      setCurrentTime(sec);
      window.open(buildYoutubeWatchUrl(rawSrc, sec), "_blank", "noopener,noreferrer");
    }
  };

  const handleCaptureScreenshot = async () => {
    if (!id) return;
    if (isTelegramLink) {
      toast.error("Open the video in Telegram to capture frames.");
      return;
    }
    if (isYoutube) {
      const sec = currentTime;
      if (!youtubeVideoId) {
        toast.error("YouTube video ID not found.");
        return;
      }
      setCapturePending(true);
      try {
        const imageData = await getYouTubeThumbnailDataUrl(youtubeVideoId, sec);
        const time = Math.floor(sec);
        const note = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          imageData,
          time,
          title: `Note ${formatTime(time)}`,
          createdAt: new Date().toISOString(),
        };
        setScreenshotNotes((prev) => {
          const next = [note, ...prev].slice(0, 80);
          void saveScreenshotNotes(id, next);
          return next;
        });
        toast.success("Screenshot note saved");
      } catch {
        toast.error("Could not capture screenshot");
      } finally {
        setCapturePending(false);
      }
      return;
    }
    const video = resolvePlyrVideoElement(videoRef, playerRef);
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error("Video is not ready for screenshot yet.");
      return;
    }

    setCapturePending(true);
    try {
      const imageData = captureVideoFrameDataUrl(video);

      const note = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageData,
        time: Math.floor(video.currentTime || currentTime || 0),
        title: `Note ${formatTime(video.currentTime || currentTime || 0)}`,
        createdAt: new Date().toISOString(),
      };

      setScreenshotNotes((prev) => {
        const next = [note, ...prev].slice(0, 80);
        void saveScreenshotNotes(id, next);
        return next;
      });
      toast.success("Screenshot note saved");
    } catch (error) {
      toast.error(error?.message || "Could not capture screenshot");
    } finally {
      setCapturePending(false);
    }
  };

  handleCaptureRef.current = handleCaptureScreenshot;
  cachedPlayUrlRef.current = cachedPlayUrl;
  addStudyMinutesRef.current = addStudyMinutes;
  handlePlaybackEndedRef.current = handlePlaybackEnded;

  const handleDeleteScreenshot = (noteId) => {
    if (!id) return;
    if (!window.confirm("Delete this screenshot note?")) return;
    setScreenshotNotes((prev) => {
      const next = prev.filter((note) => note.id !== noteId);
      void saveScreenshotNotes(id, next);
      return next;
    });
  };

  const handleRenameScreenshot = (note) => {
    if (!id || !note?.id) return;
    const nextTitle = window.prompt("Set note title", note.title || `Note ${formatTime(note.time)}`);
    if (nextTitle == null) return;
    const cleanTitle = String(nextTitle).trim();
    if (!cleanTitle) return;
    setScreenshotNotes((prev) => {
      const next = prev.map((item) => (item.id === note.id ? { ...item, title: cleanTitle } : item));
      void saveScreenshotNotes(id, next);
      return next;
    });
  };

  const handleDownloadScreenshot = (note) => {
    const noteName = String(note?.title || `note_${formatTime(note?.time || 0)}`).replace(/[^a-z0-9-_]/gi, "_");
    downloadDataUrl(note.imageData, `${(item?.title || "video").replace(/[^a-z0-9-_]/gi, "_")}_${noteName}.png`);
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
        pdf.text(`Video: ${item?.title || "Lesson"}`, 36, 72);

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

      const filename = `${String(item?.title || "video")
        .replace(/[^a-z0-9-_]/gi, "_")
        .slice(0, 64)}_screenshot_notes.pdf`;
      pdf.save(filename);
      toast.success("Screenshot notes PDF downloaded");
    } catch {
      toast.error("Could not generate PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  // Extra shortcut: "S" captures a screenshot note (Plyr handles the rest).
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (isYoutube || isTelegramLink) return;
      if (event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        void handleCaptureRef.current?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isYoutube, isTelegramLink]);

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
          onClick={() => setPageDark((d) => !d)}
          aria-label="Dark mode for this page"
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? <FiSun size={18} /> : <FiMoon size={18} />}
        </button>
      </header>

      {!item ? (
        <div className="watch-stage flex aspect-video items-center justify-center">
          <FiLoader className="animate-spin text-2xl text-teal-400" />
        </div>
      ) : (
        <>
          <div className="watch-stage">
            <div className="watch-float-nav md:hidden" aria-hidden={false}>
              <Link to="/" className="watch-float-btn" aria-label="Back">
                <FiArrowLeft size={20} />
              </Link>
              <button
                type="button"
                className="watch-float-btn"
                onClick={() => setPageDark((d) => !d)}
                aria-label="Toggle theme"
              >
                {isDark ? <FiSun size={18} /> : <FiMoon size={18} />}
              </button>
            </div>
            {isTelegramLink ? (
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                {item?.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-60"
                  />
                ) : null}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/55 px-6 text-center">
                  <p className="text-sm font-medium text-white">Video on Telegram</p>
                  <p className="max-w-md text-xs text-slate-300">
                    Playback opens in Telegram (or your browser). Study time on this page still counts toward your
                    tracker.
                  </p>
                  <a
                    href={telegramLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-sky-500"
                  >
                    Open in Telegram
                  </a>
                </div>
              </div>
            ) : isYoutube ? (
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                {youtubeThumb ? (
                  <img
                    src={youtubeThumb}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-60"
                  />
                ) : null}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/55 px-6 text-center">
                  <p className="text-sm font-medium text-white">Hosted on YouTube (Unlisted)</p>
                  <p className="max-w-md text-xs text-slate-300">
                    Playback opens on YouTube in a new tab. Study time on this page still counts toward your
                    tracker.
                  </p>
                  <a
                    href={buildYoutubeWatchUrl(rawSrc, currentTime)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-red-500"
                  >
                    Watch on YouTube
                  </a>
                  {currentTime > 0 ? (
                    <p className="text-xs text-slate-400">
                      Last jump position: {formatTime(currentTime)} (included in the link above)
                    </p>
                  ) : null}
                </div>
              </div>
            ) : showNativePlayer ? (
              <div ref={playerRef} className="cds-plyr-shell group relative aspect-video w-full overflow-hidden bg-black">
                <CdsPlyrPlayer
                  key={`${id}-${playerGeneration}`}
                  contentId={id}
                  src={playbackSrc}
                  ready={playbackSourceReady && (!isTelegramStream || telegramStatus.live || cachedPlayUrl)}
                  videoRef={videoRef}
                  onScreenshot={handleCaptureScreenshot}
                  onLoadStart={handleVideoLoadStart}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onDurationChange={handleVideoDurationChange}
                  onProgress={handleVideoProgress}
                  onError={handleVideoError}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onPlay={handleVideoPlay}
                  onPause={handleVideoPause}
                  onEnded={handleVideoEnded}
                  onStalled={handleVideoStalled}
                />

                {showLibraryCheckOverlay && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 text-center">
                    <FiLoader className="animate-spin text-white" size={28} />
                    <p className="text-sm text-slate-300">Checking PC library…</p>
                  </div>
                )}

                {telegramBlocksStream && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
                    <p className="text-sm font-medium text-white">Telegram stream unavailable</p>
                    <p className="max-w-sm text-xs text-slate-400">
                      Connect Telegram using the banner below, then click Recheck or Retry playback.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary inline-flex text-xs"
                      onClick={() => void refreshTelegramStatus()}
                    >
                      <FiRefreshCw size={14} /> Recheck connection
                    </button>
                  </div>
                )}

                {showStreamLoadingOverlay && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center">
                    <FiLoader className="animate-spin text-3xl text-teal-400" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">
                        {playbackStalled ? "Playback stalled" : "Loading video…"}
                      </p>
                      <p className="text-xs tabular-nums text-slate-300">
                        {playbackStalled
                          ? "Telegram stream did not start. Check connection below."
                          : `Waiting for stream · ${formatTime(loadElapsedSec)} elapsed`}
                      </p>
                      {hintedDuration > 0 ? (
                        <p className="text-[11px] text-slate-500">
                          Expected ~ {formatTime(hintedDuration)}
                        </p>
                      ) : null}
                    </div>
                    <div className="w-full max-w-xs space-y-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                        <div
                          className="h-full rounded-full bg-teal-500 transition-[width] duration-300 ease-out"
                          style={{ width: `${Math.max(bufferPercent, 6)}%` }}
                        />
                      </div>
                      <p className="text-[11px] tabular-nums text-slate-400">
                        {bufferPercent > 0 ? `${bufferPercent}% buffered` : "Connecting to stream…"}
                      </p>
                    </div>
                    {(playbackStalled || loadElapsedSec >= 30) && (
                      <button
                        type="button"
                        className="btn-secondary inline-flex text-xs"
                        onClick={() => void handleRetryPlayback()}
                      >
                        <FiRefreshCw size={14} /> Retry playback
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="watch-body">
            <div className="watch-meta">
              <h1 className="text-[15px] font-semibold leading-snug md:text-2xl">{item.title}</h1>
              <p className={`mt-0.5 line-clamp-1 text-xs md:mt-1 md:text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {item.subjectId?.name} · {item.chapterId?.chapterName}
              </p>
            </div>

            {/* Mobile: tools collapsed by default */}
            <MobileCollapsibleSection
              key={`tools-${id}`}
              title="Playback tools"
              subtitle={
                isTelegramStream && !telegramStatus.live
                  ? "Telegram connection required"
                  : "Smooth playback & cache"
              }
              defaultOpen={isTelegramStream && !telegramStatus.live && !telegramStatus.checking}
              isDark={isDark}
              badge={isTelegramStream && !telegramStatus.live ? "!" : ""}
            >
              <div className="space-y-2 md:space-y-3">
                {isLocalFrontend() ? (
                  <SmoothPlaybackPanel
                    contentId={id}
                    eligible={canCachePlayback}
                    isDark={isDark}
                    onPlayUrlChange={setCachedPlayUrl}
                    onUsingLocalLibraryChange={(value) => {
                      usingLocalLibraryRef.current = value;
                      usingCacheRef.current = value;
                    }}
                    onPrepareDownload={async () => {
                      const video = videoRef.current;
                      if (video && !video.paused) {
                        video.pause();
                        setIsPlaying(false);
                        await new Promise((resolve) => setTimeout(resolve, 600));
                      }
                    }}
                  />
                ) : (
                  <VideoPlaybackCachePanel
                    contentId={id}
                    eligible={canCachePlayback}
                    isDark={isDark}
                    onPlayUrlChange={setCachedPlayUrl}
                    onUsingCacheChange={(value) => {
                      usingCacheRef.current = value;
                    }}
                  />
                )}
                {isTelegramStream ? (
                  <TelegramConnectionStatus
                    checking={telegramStatus.checking}
                    connected={telegramStatus.connected}
                    live={telegramStatus.live}
                    error={telegramStatus.error}
                    phone={telegramStatus.phone}
                    isDark={isDark}
                    onRefresh={refreshTelegramStatus}
                    onResetSession={handleResetTelegramSession}
                    resetting={telegramStatusResetting}
                  />
                ) : null}
              </div>
            </MobileCollapsibleSection>

            <MobileCollapsibleSection
              key={`pdfs-${id}`}
              title="Chapter PDFs"
              subtitle={
                relatedPdfs.length
                  ? `${relatedPdfs.length} document${relatedPdfs.length === 1 ? "" : "s"} in this chapter`
                  : "No PDFs in this chapter"
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
                    No PDF found in this chapter yet.
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
              key={`notes-${id}`}
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
                <div className="flex gap-2 md:hidden" />
                <div className="flex w-full gap-2 sm:w-auto">
                  <button
                    type="button"
                    className="btn-secondary flex-1 text-xs sm:flex-none"
                    onClick={handleCaptureScreenshot}
                    disabled={capturePending}
                  >
                    <FiCamera size={13} />
                    {capturePending ? "Saving…" : "Capture"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary flex-1 text-xs sm:flex-none"
                    onClick={handleDownloadAllScreenshotsPdf}
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
              {(isYoutube || isTelegramLink) && (
                <p className="mt-2 hidden text-xs text-sky-500 dark:text-sky-400 md:block">
                  For externally hosted videos, notes use thumbnails where available.
                </p>
              )}
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
                    href={`/video/${id}/screenshot/${note.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full"
                    title="Open screenshot in new tab"
                  >
                    <img src={note.imageData} alt={`Screenshot note at ${formatTime(note.time)}`} className="aspect-video w-full object-cover" />
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
          </div>
        </>
      )}
    </div>
  );
};

export default VideoPlayerPage;
