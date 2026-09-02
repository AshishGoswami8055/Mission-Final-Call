import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import ReactPlayer from "react-player";
import api from "../api/client";
import { useTelegramPlaybackStatus } from "../hooks/useTelegramPlaybackStatus";
import MobileCollapsibleSection from "../components/MobileCollapsibleSection";
import CdsPlyrPlayer from "../components/CdsPlyrPlayer";
import TelegramConnectionStatus from "../components/TelegramConnectionStatus";
import WatchPageHeader from "../components/WatchPageHeader";
import VideoCacheStatusBar from "../components/VideoCacheStatusBar";
import SmoothPlaybackPanel from "../components/SmoothPlaybackPanel";
import VideoPlaybackCachePanel from "../components/VideoPlaybackCachePanel";
import { useStudy } from "../context/StudyContext";
import { useTheme } from "../context/ThemeContext";
import { alternateStreamCachePlayUrl, buildStreamCachePlayUrl, buildYoutubePlaybackStreamUrl, buildYoutubeWatchUrl, extractYoutubeVideoId, getTelegramVideoUrl, isLocalFrontend, isTelegramLinkVideo, isTelegramStreamContent, isYouTubeUrl, preferSameOriginMediaUrl, resolveContentSrc, resolveVideoPlaybackUrl, toAbsoluteMediaUrl } from "../utils/media";
import { captureVideoFrameDataUrl, resolvePlyrVideoElement, seekVideoTo, reloadVideoPreservingTime } from "../utils/videoScreenshot";
import { fetchLocalLibraryStatus } from "../utils/localLibraryApi";
import { fetchContentStreamCache } from "../utils/mediaStorageApi";
import { fetchYoutubePlaybackStatus, startYoutubePlaybackPrepare } from "../utils/youtubePlaybackApi";
import { uploadYoutubeCookiesFile } from "../utils/youtubeCookiesApi";
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
  const [streamCachePlayUrl, setStreamCachePlayUrl] = useState(null);
  const [playbackSourceReady, setPlaybackSourceReady] = useState(false);
  const [playerGeneration, setPlayerGeneration] = useState(0);
  const [playbackStalled, setPlaybackStalled] = useState(false);
  const [cacheRefreshToken, setCacheRefreshToken] = useState(0);
  const [streamCacheComplete, setStreamCacheComplete] = useState(false);
  const [streamCacheOptimizing, setStreamCacheOptimizing] = useState(false);
  const [youtubePlyrUrl, setYoutubePlyrUrl] = useState(null);
  const [youtubePreparing, setYoutubePreparing] = useState(false);
  const [youtubePrepareFailed, setYoutubePrepareFailed] = useState(false);
  const [youtubeNeedsCookies, setYoutubeNeedsCookies] = useState(false);
  const [youtubePrepareError, setYoutubePrepareError] = useState("");
  const [youtubeCookiesUploading, setYoutubeCookiesUploading] = useState(false);
  const [youtubeRetryToken, setYoutubeRetryToken] = useState(0);
  const [mobilePdfShowAll, setMobilePdfShowAll] = useState(false);
  const usingCacheRef = useRef(false);
  const usingLocalLibraryRef = useRef(false);
  const usingStreamCacheDiskRef = useRef(false);
  const videoRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const youtubeTimeRef = useRef(0);
  const youtubeResumeAppliedRef = useRef(false);
  const youtubeUiTickRef = useRef(0);
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
  const prevYoutubeTimeRef = useRef(0);
  const syncWatchToServerRef = useRef(async () => {});
  const streamCacheCompleteRef = useRef(false);
  const streamCachePlayUrlRef = useRef(null);
  const streamCacheFaststartRef = useRef(true);
  const userSeekingRef = useRef(false);
  const diskPlaybackFailedRef = useRef(false);
  const ignoreVideoErrorUntilRef = useRef(0);
  const videoErrorRetriesRef = useRef(0);
  const videoErrorTimerRef = useRef(null);
  const resumeAppliedRef = useRef(false);
  const pendingMidPlaybackRestoreRef = useRef(0);
  const hasStartedPlayingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const resumeAfterLoadRef = useRef(false);
  const resolvedSourceIdRef = useRef(null);
  const { addStudyMinutes, addToWatchHistory, applyVideoStreakStatus } = useStudy();

  const isTelegramStream = item ? isTelegramStreamContent(item) : false;
  const isTelegramLink = item ? isTelegramLinkVideo(item) : false;
  const telegramLink = item ? getTelegramVideoUrl(item) : "";
  const rawSrc = item ? resolveContentSrc(item) : "";
  const isYoutube = !isTelegramLink && !isTelegramStream && isYouTubeUrl(rawSrc);
  const useYoutubePlyr = Boolean(youtubePlyrUrl);
  const showYoutubeEmbed = isYoutube && !useYoutubePlyr && !youtubePreparing;
  const canCachePlayback = Boolean(
    item &&
      (isTelegramStream ||
        item.sourceType === "cloudinary" ||
        (item.sourceType === "upload" && item.filePath))
  );
  const src = isTelegramLink || (isYoutube && !useYoutubePlyr) ? "" : preferSameOriginMediaUrl(rawSrc);
  const waitingForLocalCacheCheck =
    isTelegramStream &&
    isLocalFrontend() &&
    !cachedPlayUrl &&
    !streamCachePlayUrl &&
    !playbackSourceReady;
  const playbackSrc = useYoutubePlyr
    ? resolveVideoPlaybackUrl(youtubePlyrUrl)
    : cachedPlayUrl
      ? resolveVideoPlaybackUrl(cachedPlayUrl)
      : streamCachePlayUrl
        ? resolveVideoPlaybackUrl(streamCachePlayUrl)
        : waitingForLocalCacheCheck || (isTelegramStream && isLocalFrontend() && streamCacheComplete)
          ? ""
          : src;
  const playingFromDisk =
    Boolean(cachedPlayUrl) ||
    Boolean(streamCachePlayUrl) ||
    usingStreamCacheDiskRef.current ||
    useYoutubePlyr;

  const {
    telegramStatus,
    telegramStatusResetting,
    refreshTelegramStatus,
    handleResetTelegramSession,
    verifyTelegramForRetry,
  } = useTelegramPlaybackStatus({ item, itemRef, isTelegramStream });

  const youtubeVideoId = isYoutube ? extractYoutubeVideoId(rawSrc) : "";
  const youtubePlayerConfig = useMemo(() => ({ youtube: { rel: 0 } }), []);

  const hintedDuration = Number(item?.duration) || 0;
  const hasVideoDuration = duration > 0 && Number.isFinite(duration);
  const showInitialLoader = Boolean(playbackSrc) && !hasVideoDuration && !isTelegramStream && !playingFromDisk;
  const telegramBlocksStream =
    isTelegramStream && !playingFromDisk && !telegramStatus.checking && !telegramStatus.connected;
  const showTelegramStreamLoader =
    isTelegramStream &&
    !playingFromDisk &&
    Boolean(playbackSrc) &&
    playbackSourceReady &&
    !telegramBlocksStream &&
    (!hasVideoDuration || playbackStalled);
  const showStreamLoadingOverlay = showInitialLoader || showTelegramStreamLoader;
  const scrubPreviewEnabled = Boolean(cachedPlayUrl || streamCachePlayUrl || useYoutubePlyr);
  const showNativePlayer = !isTelegramLink && (!isYoutube || useYoutubePlyr);
  const showLibraryCheckOverlay =
    showNativePlayer && !playbackSourceReady && isLocalFrontend() && isTelegramStream && canCachePlayback;
  const showOptimizingOverlay =
    showNativePlayer &&
    playbackSourceReady &&
    streamCacheOptimizing &&
    !streamCachePlayUrl &&
    !cachedPlayUrl;

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

  const applyStreamCachePlayback = useCallback(
    (playWebPath = null, { optimizing = false, faststart = true } = {}) => {
      if (!id) return false;
      if (optimizing) {
        setStreamCacheOptimizing(true);
        if (streamCachePlayUrlRef.current && !/\.web\.mp4/i.test(streamCachePlayUrlRef.current)) {
          setStreamCachePlayUrl(null);
        }
        streamCacheCompleteRef.current = true;
        usingStreamCacheDiskRef.current = true;
        usingCacheRef.current = true;
        streamCacheFaststartRef.current = faststart !== false;
        setStreamCacheComplete(true);
        return true;
      }
      if (!playWebPath || !String(playWebPath).startsWith("/uploads/")) return false;
      setStreamCacheOptimizing(false);
      const playUrl = buildStreamCachePlayUrl(id, playWebPath);
      if (!playUrl) return false;
      diskPlaybackFailedRef.current = false;
      streamCacheCompleteRef.current = true;
      usingStreamCacheDiskRef.current = true;
      usingCacheRef.current = true;
      streamCacheFaststartRef.current = faststart !== false;
      setStreamCacheComplete(true);
      if (streamCachePlayUrlRef.current === playUrl) return true;

      const video = videoRef.current;
      const currentTime = Number(video?.currentTime) || lastSavedPositionRef.current || 0;
      resumeAfterLoadRef.current = Boolean(video && !video.paused && !video.ended);
      if (currentTime > MIN_RESUME_SECONDS) {
        pendingMidPlaybackRestoreRef.current = currentTime;
        lastSavedPositionRef.current = currentTime;
      }
      ignoreVideoErrorUntilRef.current = Date.now() + 3000;
      setStreamCachePlayUrl(playUrl);
      return true;
    },
    [id]
  );

  const handleStreamCacheStatus = useCallback(
    (data) => {
      if (!data?.complete) {
        if (streamCacheCompleteRef.current) {
          streamCacheCompleteRef.current = false;
          usingStreamCacheDiskRef.current = false;
          setStreamCacheComplete(false);
          setStreamCacheOptimizing(false);
          setStreamCachePlayUrl(null);
        }
        return;
      }
      if (!data.playUrl && !data.optimizingPlayback) return;
      applyStreamCachePlayback(data.playUrl, {
        optimizing: Boolean(data.optimizingPlayback),
        faststart: data.faststart !== false,
      });
    },
    [applyStreamCachePlayback]
  );

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
    if (!(isTelegramStream && hintedDuration > 0 && !playingFromDisk)) {
      if (!playingFromDisk) setDuration(0);
    } else {
      setDuration(hintedDuration);
    }
    loadStartedAtRef.current = Date.now();
  }, [playbackSrc, id, isTelegramStream, hintedDuration, playingFromDisk]);

  useEffect(() => {
    if (!id || !item) {
      if (!id) {
        resolvedSourceIdRef.current = null;
        setPlaybackSourceReady(false);
      }
      return undefined;
    }

    if (isYoutube) {
      if (!isLocalFrontend()) {
        setPlaybackSourceReady(true);
      }
      return undefined;
    }

    let cancelled = false;

    const resolvePlaybackSource = async () => {
      if (!streamCachePlayUrlRef.current && !cachedPlayUrlRef.current) {
        setPlaybackSourceReady(false);
      }

      if (isLocalFrontend() && canCachePlayback) {
        try {
          const libraryPromise = fetchLocalLibraryStatus(id).catch(() => null);
          const streamCachePromise = isTelegramStream
            ? fetchContentStreamCache(id).catch(() => null)
            : Promise.resolve(null);
          const [libraryRes, streamCacheRes] = await Promise.all([
            libraryPromise,
            streamCachePromise,
          ]);

          if (
            !cancelled &&
            libraryRes?.data?.cached &&
            libraryRes.data.ready &&
            libraryRes.data.playUrl
          ) {
            setCachedPlayUrl(libraryRes.data.playUrl);
            usingLocalLibraryRef.current = true;
            usingCacheRef.current = true;
          } else if (!cancelled && streamCacheRes?.data?.complete) {
            applyStreamCachePlayback(streamCacheRes.data.playUrl, {
              optimizing: Boolean(streamCacheRes.data.optimizingPlayback),
              faststart: streamCacheRes.data.faststart !== false,
            });
          }
        } catch {
          /* fall back to stream */
        }
      }
      if (!cancelled) {
        resolvedSourceIdRef.current = id;
        setPlaybackSourceReady(true);
      }
    };

    void resolvePlaybackSource();
    return () => {
      cancelled = true;
    };
  }, [id, item?._id, canCachePlayback, isTelegramStream, isYoutube, applyStreamCachePlayback]);

  useEffect(() => {
    if (!id || !item || !isYoutube || !isLocalFrontend()) {
      setYoutubePlyrUrl(null);
      setYoutubePreparing(false);
      setYoutubePrepareFailed(false);
      return undefined;
    }

    let cancelled = false;
    let pollTimer = null;

    const finishReady = () => {
      if (cancelled) return;
      setYoutubePlyrUrl(buildYoutubePlaybackStreamUrl(id));
      setYoutubePreparing(false);
      setYoutubePrepareFailed(false);
      setPlaybackSourceReady(true);
    };

    const failToEmbed = (message) => {
      if (cancelled) return;
      setYoutubePlyrUrl(null);
      setYoutubePreparing(false);
      setYoutubePrepareFailed(true);
      setYoutubePrepareError(message || "");
      setYoutubeNeedsCookies(/cookies|bot|sign in/i.test(message || ""));
      setPlaybackSourceReady(true);
      if (message && !/cookies|bot|sign in/i.test(message)) toast.error(message);
    };

    const pollStatus = async () => {
      if (cancelled) return;
      try {
        const { data } = await fetchYoutubePlaybackStatus(id);
        if (cancelled) return;
        if (data.ready) {
          finishReady();
          return;
        }
        if (data.error && !data.preparing) {
          failToEmbed(data.error);
          return;
        }
        setYoutubePreparing(true);
        pollTimer = window.setTimeout(pollStatus, 2000);
      } catch {
        pollTimer = window.setTimeout(pollStatus, 3000);
      }
    };

    const prepare = async () => {
      setPlaybackSourceReady(false);
      setYoutubePlyrUrl(null);
      setYoutubePrepareFailed(false);
      try {
        const { data } = await fetchYoutubePlaybackStatus(id);
        if (cancelled) return;
        if (data.ready) {
          finishReady();
          return;
        }
        setYoutubePreparing(true);
        if (!data.preparing) {
          await startYoutubePlaybackPrepare(id);
        }
        pollTimer = window.setTimeout(pollStatus, 1500);
      } catch (error) {
        failToEmbed(error.response?.data?.message || "Could not prepare CDS player for YouTube");
      }
    };

    void prepare();
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [id, item, isYoutube, youtubeRetryToken]);

  useEffect(() => {
    setPlayerGeneration(0);
    setPlaybackStalled(false);
    setMobilePdfShowAll(false);
    setCachedPlayUrl(null);
    setStreamCachePlayUrl(null);
    setStreamCacheComplete(false);
    setPlaybackSourceReady(false);
    setYoutubePlyrUrl(null);
    setYoutubePreparing(false);
    setYoutubePrepareFailed(false);
    setYoutubeNeedsCookies(false);
    setYoutubePrepareError("");
    usingCacheRef.current = false;
    usingLocalLibraryRef.current = false;
    usingStreamCacheDiskRef.current = false;
    streamCacheCompleteRef.current = false;
    videoErrorRetriesRef.current = 0;
    resumeAppliedRef.current = false;
    youtubeResumeAppliedRef.current = false;
    youtubeTimeRef.current = 0;
    youtubeUiTickRef.current = 0;
    prevYoutubeTimeRef.current = 0;
    pendingMidPlaybackRestoreRef.current = 0;
    hasStartedPlayingRef.current = false;
    isPlayingRef.current = false;
    diskPlaybackFailedRef.current = false;
    ignoreVideoErrorUntilRef.current = 0;
    resumeAfterLoadRef.current = false;
    resolvedSourceIdRef.current = null;
  }, [id]);

  const handleRetryPlayback = useCallback(async () => {
    setPlaybackStalled(false);
    setBufferPercent(0);
    setLoadElapsedSec(0);
    loadStartedAtRef.current = Date.now();
    videoErrorRetriesRef.current = 0;
    diskPlaybackFailedRef.current = false;
    if (videoErrorTimerRef.current) {
      clearTimeout(videoErrorTimerRef.current);
      videoErrorTimerRef.current = null;
    }

    if (isTelegramStream && id && isLocalFrontend()) {
      try {
        const { data } = await fetchContentStreamCache(id);
        if (data?.complete) {
          applyStreamCachePlayback(data.playUrl, {
        optimizing: Boolean(data.optimizingPlayback),
        faststart: data.faststart !== false,
      });
          if (!data.optimizingPlayback) {
            setPlayerGeneration((value) => value + 1);
          }
          return;
        }
      } catch {
        /* fall through */
      }
    }

    if (isTelegramStream && !streamCachePlayUrl) {
      await verifyTelegramForRetry();
    }
    setPlayerGeneration((value) => value + 1);
  }, [id, isTelegramStream, streamCachePlayUrl, verifyTelegramForRetry, applyStreamCachePlayback]);

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
    if (
      hasStartedPlayingRef.current &&
      lastSavedPositionRef.current > MIN_RESUME_SECONDS
    ) {
      pendingMidPlaybackRestoreRef.current = lastSavedPositionRef.current;
    }
  }, []);

  const handleVideoLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    videoErrorRetriesRef.current = 0;
    setPlaybackStalled(false);
    applyVideoDuration(video);
    updateBufferProgress(video);
    const dur = video.duration || 0;
    if (!id || !(dur > 0)) return;

    if (usingStreamCacheDiskRef.current && streamCacheFaststartRef.current === false) {
      resumeAppliedRef.current = true;
      pendingMidPlaybackRestoreRef.current = 0;
      if (resumeAfterLoadRef.current) {
        resumeAfterLoadRef.current = false;
        void video.play().catch(() => {});
      }
      return;
    }

    const pendingRestore = pendingMidPlaybackRestoreRef.current;
    if (pendingRestore > MIN_RESUME_SECONDS && video.currentTime < MIN_RESUME_SECONDS) {
      pendingMidPlaybackRestoreRef.current = 0;
      void seekVideoTo(video, pendingRestore).then((ok) => {
        if (!videoRef.current) return;
        if (!ok) {
          resumeAfterLoadRef.current = false;
          void videoRef.current.play().catch(() => {});
          return;
        }
        setCurrentTime(pendingRestore);
        lastSavedPositionRef.current = pendingRestore;
        prevVideoTimeRef.current = pendingRestore;
        if (resumeAfterLoadRef.current) {
          resumeAfterLoadRef.current = false;
          void videoRef.current.play().catch(() => {});
        }
      });
      return;
    }

    if (resumeAfterLoadRef.current) {
      resumeAfterLoadRef.current = false;
      void video.play().catch(() => {});
    }

    const saved = loadVideoPosition(id);
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
      if (!videoRef.current) return;
      resumeAppliedRef.current = true;
      if (!ok) {
        void videoRef.current.play().catch(() => {});
        return;
      }
      setCurrentTime(saved);
      lastSavedPositionRef.current = saved;
      prevVideoTimeRef.current = saved;
      toast.success(`Resumed from ${formatTime(saved)}`);
    });
  }, [applyVideoDuration, id, updateBufferProgress]);

  const handleVideoDurationChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    applyVideoDuration(video);
    updateBufferProgress(video);
  }, [applyVideoDuration, updateBufferProgress]);

  const lastCacheStatusRefreshRef = useRef(0);

  const handleVideoSeeking = useCallback(() => {
    const video = videoRef.current;
    userSeekingRef.current = true;
    ignoreVideoErrorUntilRef.current = Date.now() + 2500;
    const t = Number(video?.currentTime);
    if (Number.isFinite(t) && t > 0) {
      lastSavedPositionRef.current = t;
      setCurrentTime(t);
    }
  }, []);

  const handleVideoSeeked = useCallback(() => {
    const video = videoRef.current;
    userSeekingRef.current = false;
    const t = Number(video?.currentTime);
    if (Number.isFinite(t) && t >= 0) {
      lastSavedPositionRef.current = t;
      prevVideoTimeRef.current = t;
      setCurrentTime(t);
      if (id) saveVideoPosition(id, t);
    }
    if (video && !video.paused) {
      void video.play().catch(() => {});
    }
  }, [id]);

  const handleVideoProgress = useCallback(() => {
    updateBufferProgress(videoRef.current);
    if (isTelegramStream && isLocalFrontend() && !streamCacheCompleteRef.current) {
      const now = Date.now();
      if (now - lastCacheStatusRefreshRef.current > 20000) {
        lastCacheStatusRefreshRef.current = now;
        setCacheRefreshToken((value) => value + 1);
      }
    }
  }, [updateBufferProgress, isTelegramStream]);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    const mediaCode = video?.error?.code;
    if (mediaCode === 1) return;
    if (userSeekingRef.current || video?.seeking) return;
    if (Date.now() < ignoreVideoErrorUntilRef.current) return;
    if (video && !video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    if (videoErrorTimerRef.current) {
      clearTimeout(videoErrorTimerRef.current);
    }

    videoErrorTimerRef.current = setTimeout(() => {
      void (async () => {
        if (Date.now() < ignoreVideoErrorUntilRef.current) return;

        const currentItem = itemRef.current;
        const telegram = currentItem ? isTelegramStreamContent(currentItem) : false;
        const currentCacheUrl = streamCachePlayUrlRef.current;

        if (
          (usingStreamCacheDiskRef.current || currentCacheUrl) &&
          videoErrorRetriesRef.current < 2 &&
          video
        ) {
          videoErrorRetriesRef.current += 1;
          const resumeAt = Math.max(
            video.currentTime || 0,
            lastSavedPositionRef.current || 0,
            loadVideoPosition(id) || 0
          );
          try {
            ignoreVideoErrorUntilRef.current = Date.now() + 2500;
            reloadVideoPreservingTime(video, resumeAt, { shouldPlay: true });
            return;
          } catch {
            /* fall through */
          }
        }

        if (usingLocalLibraryRef.current || cachedPlayUrlRef.current) {
          toast.error("Local video file failed to load.");
          return;
        }

        if (telegram && id && isLocalFrontend()) {
          try {
            const { data } = await fetchContentStreamCache(id);
            if (data?.complete) {
              ignoreVideoErrorUntilRef.current = Date.now() + 3000;
              applyStreamCachePlayback(data.playUrl, {
                optimizing: Boolean(data.optimizingPlayback),
                faststart: data.faststart !== false,
              });
              if (data.optimizingPlayback) return;
              const altUrl = alternateStreamCachePlayUrl(id, data.playUrl, streamCachePlayUrlRef.current);
              if (altUrl && altUrl !== streamCachePlayUrlRef.current) {
                usingStreamCacheDiskRef.current = true;
                setStreamCachePlayUrl(altUrl);
              }
              videoErrorRetriesRef.current = 0;
              setPlayerGeneration((value) => value + 1);
              return;
            }
          } catch {
            /* continue */
          }
          if (streamCacheCompleteRef.current) {
            applyStreamCachePlayback();
            setPlayerGeneration((value) => value + 1);
            return;
          }
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
        if (streamCacheCompleteRef.current) {
          applyStreamCachePlayback();
          setPlayerGeneration((value) => value + 1);
          return;
        }
        toast.error(
          "Telegram stream failed. Re-login to Telegram in Settings, restart the server, wait 30 seconds, then refresh. Or click Smooth playback to save this video to your PC first.",
          { duration: 10000 }
        );
      })();
    }, 700);
  }, [canCachePlayback, id, applyStreamCachePlayback]);

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

  const handleVideoPlay = useCallback(() => {
    hasStartedPlayingRef.current = true;
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, []);

  const handleVideoPause = useCallback(() => {
    if (resumeAfterLoadRef.current || Date.now() < ignoreVideoErrorUntilRef.current) {
      return;
    }
    isPlayingRef.current = false;
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
    if (!id || !isTelegramStream || !isLocalFrontend()) {
      setStreamCacheComplete(false);
      return undefined;
    }
    if (streamCachePlayUrlRef.current) return undefined;

    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await fetchContentStreamCache(id);
        if (cancelled) return;
        const complete = Boolean(data?.complete);
        setStreamCacheComplete(complete);
        if (complete) {
          applyStreamCachePlayback(data.playUrl, {
        optimizing: Boolean(data.optimizingPlayback),
        faststart: data.faststart !== false,
      });
        }
      } catch {
        if (!cancelled) setStreamCacheComplete(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, isTelegramStream, cacheRefreshToken, applyStreamCachePlayback]);

  useEffect(() => {
    if (!id || !streamCacheOptimizing || streamCachePlayUrl) return undefined;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await fetchContentStreamCache(id);
          applyStreamCachePlayback(data?.playUrl, {
            optimizing: false,
            faststart: data?.faststart !== false,
          });
        } catch {
          applyStreamCachePlayback(null, { optimizing: false });
        }
      })();
    }, 120000);
    return () => window.clearTimeout(timer);
  }, [id, streamCacheOptimizing, streamCachePlayUrl, applyStreamCachePlayback]);

  useEffect(() => {
    return () => {
      if (videoErrorTimerRef.current) {
        clearTimeout(videoErrorTimerRef.current);
      }
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
      const isTgLink = isTelegramLinkVideo(currentItem);
      if (isTgLink && currentItem) {
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

  const handleYoutubeCookiesUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setYoutubeCookiesUploading(true);
    try {
      await uploadYoutubeCookiesFile(file);
      toast.success("YouTube cookies saved — retrying full-quality CDS download…");
      setYoutubePrepareFailed(false);
      setYoutubeNeedsCookies(false);
      setYoutubePrepareError("");
      setYoutubeRetryToken((token) => token + 1);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save YouTube cookies");
    } finally {
      setYoutubeCookiesUploading(false);
    }
  };

  const handleRetryYoutubePlyr = () => {
    setYoutubePrepareFailed(false);
    setYoutubeNeedsCookies(false);
    setYoutubePrepareError("");
    setYoutubeRetryToken((token) => token + 1);
  };

  const jumpToMoment = (timecode) => {
    const sec = parseTimecodeToSeconds(timecode);
    if (Number.isNaN(sec) || sec < 0) return;
    if ((!isYoutube || useYoutubePlyr) && !isTelegramLink && videoRef.current) {
      void seekVideoTo(videoRef.current, sec).then((ok) => {
        if (!ok || !videoRef.current) return;
        setCurrentTime(sec);
        lastSavedPositionRef.current = sec;
        void videoRef.current.play().catch(() => {});
      });
      return;
    }
    if (isTelegramLink) {
      setCurrentTime(sec);
      window.open(telegramLink, "_blank", "noopener,noreferrer");
      return;
    }
    if (isYoutube) {
      setCurrentTime(sec);
      youtubeTimeRef.current = sec;
      const ytVideo = youtubePlayerRef.current;
      if (ytVideo && Number.isFinite(ytVideo.currentTime)) {
        ytVideo.currentTime = sec;
        void ytVideo.play?.().catch(() => {});
        return;
      }
      window.open(buildYoutubeWatchUrl(rawSrc, sec), "_blank", "noopener,noreferrer");
      return;
    }
  };

  const handleYoutubeTimeUpdate = useCallback(
    (event) => {
      const ytVideo = event?.currentTarget;
      const t = ytVideo?.currentTime;
      if (!Number.isFinite(t)) return;
      youtubeTimeRef.current = t;

      const now = Date.now();
      if (now - youtubeUiTickRef.current >= 1000) {
        youtubeUiTickRef.current = now;
        setCurrentTime(t);
      }

      if (isPlayingRef.current && (!ytVideo || !ytVideo.paused)) {
        const prev = prevYoutubeTimeRef.current;
        const delta = Math.max(0, Math.min(2, t - prev));
        prevYoutubeTimeRef.current = t;
        studyAccumSecondsRef.current += delta;
        heartbeatPendingSecondsRef.current += delta;
        if (studyAccumSecondsRef.current >= 60) {
          const sid = itemRef.current?.subjectId?._id ?? itemRef.current?.subjectId;
          addStudyMinutesRef.current(studyAccumSecondsRef.current / 60, sid);
          studyAccumSecondsRef.current = 0;
        }
        if (heartbeatPendingSecondsRef.current >= 300) void syncWatchToServerRef.current(300);
      }

      if (id && Math.abs(t - lastSavedPositionRef.current) >= 5) {
        lastSavedPositionRef.current = t;
        saveVideoPosition(id, t);
      }
    },
    [id]
  );

  const handleYoutubeSeeked = useCallback(
    (event) => {
      const t = event?.currentTarget?.currentTime;
      if (!Number.isFinite(t)) return;
      youtubeTimeRef.current = t;
      setCurrentTime(t);
      if (id) saveVideoPosition(id, t);
    },
    [id]
  );

  const handleYoutubeReady = useCallback(() => {
    setPlaybackSourceReady(true);
    if (youtubeResumeAppliedRef.current) return;
    youtubeResumeAppliedRef.current = true;

    const saved = loadVideoPosition(id);
    const ytVideo = youtubePlayerRef.current;
    if (saved != null && saved > 0 && ytVideo) {
      ytVideo.currentTime = saved;
      youtubeTimeRef.current = saved;
      setCurrentTime(saved);
      lastSavedPositionRef.current = saved;
    }
  }, [id]);

  const openYoutubeExternally = useCallback(
    (event) => {
      event.preventDefault();
      const sec = youtubePlayerRef.current?.currentTime ?? youtubeTimeRef.current ?? 0;
      window.open(buildYoutubeWatchUrl(rawSrc, sec), "_blank", "noopener,noreferrer");
    },
    [rawSrc]
  );

  const handleCaptureScreenshot = async () => {
    if (!id) return;
    if (isTelegramLink) {
      toast.error("Open the video in Telegram to capture frames.");
      return;
    }
    if (isYoutube && !useYoutubePlyr) {
      const sec = youtubePlayerRef.current?.currentTime ?? youtubeTimeRef.current ?? currentTime;
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
  streamCachePlayUrlRef.current = streamCachePlayUrl;
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
      if ((isYoutube && !useYoutubePlyr) || isTelegramLink) return;
      if (event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        void handleCaptureRef.current?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isYoutube, useYoutubePlyr, isTelegramLink]);

  return (
    <div
      className={`page-viewer page-viewer--watch ${
        isDark ? "page-viewer--dark text-slate-100" : "text-slate-800"
      }`}
    >
      <WatchPageHeader
        isDark={isDark}
        onToggleTheme={() => setPageDark((d) => !d)}
        subjects={
          item?.subjectId
            ? [
                typeof item.subjectId === "object"
                  ? item.subjectId
                  : { _id: item.subjectId, name: "Subject" },
              ]
            : []
        }
      />

      {!item ? (
        <div className="watch-stage flex aspect-video items-center justify-center">
          <FiLoader className="animate-spin text-2xl text-teal-400" />
        </div>
      ) : (
        <>
          <div className="watch-stage">
            <div
              className="watch-float-nav md:hidden"
              aria-hidden={false}
              data-cds-ignore-fs-dblclick
              onDoubleClick={(event) => event.stopPropagation()}
            >
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
            ) : isYoutube && youtubePreparing ? (
              <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden bg-black text-white">
                <FiLoader className="animate-spin text-sky-400" size={28} />
                <p className="text-sm font-medium">Preparing CDS player…</p>
                <p className="max-w-sm px-6 text-center text-xs text-slate-400">
                  Downloading full 1080p YouTube quality (~800MB for this 6.5h video). First time only — please keep this tab open.
                </p>
              </div>
            ) : showYoutubeEmbed ? (
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                <ReactPlayer
                  key={`youtube-${id}`}
                  ref={youtubePlayerRef}
                  src={rawSrc}
                  width="100%"
                  height="100%"
                  className="absolute inset-0 [&>video]:h-full [&>video]:w-full"
                  controls
                  playsInline
                  onReady={handleYoutubeReady}
                  onTimeUpdate={handleYoutubeTimeUpdate}
                  onSeeked={handleYoutubeSeeked}
                  onDurationChange={(event) => {
                    const d = event?.currentTarget?.duration;
                    if (Number.isFinite(d) && d > 0) setDuration(d);
                  }}
                  onPlay={() => {
                    hasStartedPlayingRef.current = true;
                    isPlayingRef.current = true;
                    setIsPlaying(true);
                  }}
                  onPause={() => {
                    isPlayingRef.current = false;
                    setIsPlaying(false);
                  }}
                  config={youtubePlayerConfig}
                />
                <a
                  href={rawSrc}
                  onClick={openYoutubeExternally}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 rounded-lg bg-black/65 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/80"
                >
                  Open on YouTube
                </a>
                {youtubeNeedsCookies ? (
                  <div
                    className="absolute inset-x-3 top-3 z-10 max-w-lg rounded-xl border border-amber-500/40 bg-black/85 p-4 text-white backdrop-blur"
                    data-cds-ignore-fs-dblclick
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <p className="text-sm font-semibold text-amber-200">YouTube login required for CDS player</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">
                      YouTube blocked the server download. While logged into YouTube in Chrome/Edge, install the extension{" "}
                      <strong>Get cookies.txt LOCALLY</strong>, export cookies for youtube.com, then upload the file here.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500">
                        {youtubeCookiesUploading ? "Uploading…" : "Upload cookies.txt"}
                        <input
                          type="file"
                          accept=".txt,text/plain"
                          className="hidden"
                          disabled={youtubeCookiesUploading}
                          onChange={handleYoutubeCookiesUpload}
                        />
                      </label>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-500 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
                        onClick={handleRetryYoutubePlyr}
                      >
                        Retry CDS download
                      </button>
                    </div>
                    {youtubePrepareError ? (
                      <p className="mt-2 text-[11px] text-slate-400">{youtubePrepareError}</p>
                    ) : null}
                  </div>
                ) : youtubePrepareFailed ? (
                  <p className="absolute bottom-3 left-3 max-w-xs rounded-lg bg-black/65 px-3 py-1.5 text-[11px] text-amber-200 backdrop-blur">
                    CDS player unavailable — using YouTube embed.
                  </p>
                ) : null}
              </div>
            ) : showNativePlayer ? (
              <div ref={playerRef} className="cds-plyr-shell group relative aspect-video w-full overflow-hidden bg-black">
                {isLocalFrontend() && (isTelegramStream || cachedPlayUrl) ? (
                  <VideoCacheStatusBar
                    contentId={id}
                    isTelegramStream={isTelegramStream}
                    pcLibraryActive={Boolean(cachedPlayUrl)}
                    isDark
                    variant="overlay"
                    refreshToken={cacheRefreshToken}
                    onStatus={handleStreamCacheStatus}
                  />
                ) : null}
                <CdsPlyrPlayer
                  key={`${id}-${playerGeneration}`}
                  contentId={id}
                  src={playbackSrc}
                  ready={
                    playbackSourceReady &&
                    (!isTelegramStream ||
                      telegramStatus.connected ||
                      cachedPlayUrl ||
                      streamCachePlayUrl ||
                      streamCacheComplete)
                  }
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
                  stallRecoveryEnabled={!playingFromDisk}
                  scrubPreviewEnabled={scrubPreviewEnabled}
                  videoPreload="auto"
                  onSeeking={handleVideoSeeking}
                  onSeeked={handleVideoSeeked}
                />

                {showOptimizingOverlay && (
                  <div
                    className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 px-6 text-center"
                    data-cds-ignore-fs-dblclick
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <FiLoader className="animate-spin text-teal-400" size={28} />
                    <p className="text-sm font-medium text-white">Preparing cached video…</p>
                    <p className="max-w-sm text-xs text-slate-400">
                      The lecture is on disk. Optimizing it so playback and seeking work in the browser.
                    </p>
                  </div>
                )}

                {showLibraryCheckOverlay && (
                  <div
                    className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 text-center"
                    data-cds-ignore-fs-dblclick
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <FiLoader className="animate-spin text-white" size={28} />
                    <p className="text-sm text-slate-300">Checking PC library…</p>
                  </div>
                )}

                {telegramBlocksStream && (
                  <div
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center"
                    data-cds-ignore-fs-dblclick
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <p className="text-sm font-medium text-white">Telegram stream unavailable</p>
                    <p className="max-w-sm text-xs text-slate-400">
                      Log in to Telegram from settings below, or use Smooth playback to download the lecture to your PC.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary inline-flex text-xs"
                      onClick={() => void refreshTelegramStatus({ force: true })}
                    >
                      <FiRefreshCw size={14} /> Recheck connection
                    </button>
                  </div>
                )}

                {showStreamLoadingOverlay && (
                  <div
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center"
                    data-cds-ignore-fs-dblclick
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
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
                isTelegramStream && !telegramStatus.connected
                  ? "Telegram connection required"
                  : "Smooth playback & cache"
              }
              defaultOpen={isTelegramStream && !telegramStatus.connected && !telegramStatus.checking}
              isDark={isDark}
              badge={isTelegramStream && !telegramStatus.connected ? "!" : ""}
            >
              <div className="space-y-2 md:space-y-3">
                {isLocalFrontend() && (isTelegramStream || canCachePlayback) ? (
                  <VideoCacheStatusBar
                    contentId={id}
                    isTelegramStream={isTelegramStream}
                    pcLibraryActive={Boolean(cachedPlayUrl)}
                    isDark={isDark}
                    variant="panel"
                    refreshToken={cacheRefreshToken}
                    onStatus={handleStreamCacheStatus}
                  />
                ) : null}
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
                    onRefresh={() => void refreshTelegramStatus({ force: true })}
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
              {(showYoutubeEmbed || isTelegramLink) && (
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
