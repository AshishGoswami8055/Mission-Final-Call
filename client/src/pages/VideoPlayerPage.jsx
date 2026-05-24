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
  FiMaximize,
  FiMessageCircle,
  FiMinimize,
  FiMoon,
  FiLoader,
  FiPause,
  FiPlay,
  FiRefreshCw,
  FiSend,
  FiSettings,
  FiSun,
  FiVolume2,
  FiVolumeX,
  FiX,
  FiZap,
  FiTrash2,
} from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import StudyTracker from "../components/StudyTracker";
import SmoothPlaybackPanel from "../components/SmoothPlaybackPanel";
import VideoPlaybackCachePanel from "../components/VideoPlaybackCachePanel";
import { useStudy } from "../context/StudyContext";
import { useTheme } from "../context/ThemeContext";
import { getTelegramVideoUrl, isLocalFrontend, isTelegramLinkVideo, isTelegramStreamContent, isYouTubeUrl, resolveContentSrc, toAbsoluteMediaUrl } from "../utils/media";
import { downloadDataUrl, loadScreenshotNotes, saveScreenshotNotes } from "../utils/screenshotNotes";
import { getYouTubeThumbnailDataUrl } from "../utils/youtubeThumbnail";

const VIDEO_POSITION_KEY = (contentId) => `cds_video_position_${contentId}`;
const VIDEO_PAGE_THEME_KEY = "cds_video_page_theme";
const MIN_RESUME_SECONDS = 5;
const SAVE_INTERVAL_SECONDS = 5;

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

const renderWithTimeHighlights = (text) => {
  const parts = String(text || "").split(/(\(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?\))/g);
  return parts.map((part, index) => {
    if (/^\(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?\)$/.test(part)) {
      return (
        <span key={`${part}-${index}`} className="font-medium text-sky-400">
          {part}
        </span>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
};

const formatElapsed = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const getApiErrorMessage = (error, fallbackMessage) => {
  const apiMessage = error?.response?.data?.message;
  const timeoutMsg = error?.code === "ECONNABORTED" ? "Request timed out after 120s. Try again." : null;
  return apiMessage || timeoutMsg || fallbackMessage;
};

const isGeminiProcessingError = (error) => {
  const status = error?.response?.status;
  const msg = String(error?.response?.data?.message || "");
  return status === 409 || /still processing/i.test(msg);
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
  const [aiOverview, setAiOverview] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [refreshingAi, setRefreshingAi] = useState(false);
  const [askInput, setAskInput] = useState("");
  const [askingAi, setAskingAi] = useState(false);
  const [askMessages, setAskMessages] = useState([]);
  const [askPanelOpen, setAskPanelOpen] = useState(true);
  const [askStatusText, setAskStatusText] = useState("");
  const [askErrorText, setAskErrorText] = useState("");
  const [processingStartedAt, setProcessingStartedAt] = useState(null);
  const [processingElapsedSec, setProcessingElapsedSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
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
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [screenshotNotes, setScreenshotNotes] = useState([]);
  const [cachedPlayUrl, setCachedPlayUrl] = useState(null);
  const [playbackSourceReady, setPlaybackSourceReady] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const usingCacheRef = useRef(false);
  const usingLocalLibraryRef = useRef(false);
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const settingsRef = useRef(null);
  const progressBarRef = useRef(null);
  const previewVideoRef = useRef(null);
  const previewSeekTimerRef = useRef(null);
  const hoverTimeRef = useRef(0);
  const lastSavedPositionRef = useRef(0);
  const studyAccumSecondsRef = useRef(0);
  const sessionStartRef = useRef(Date.now());
  const itemRef = useRef(null);
  const prevVideoTimeRef = useRef(0);
  const [timelineHover, setTimelineHover] = useState(null);
  const { addStudyMinutes, addToWatchHistory } = useStudy();

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
  const src = isTelegramLink || isYoutube ? "" : rawSrc;
  const playbackSrc = cachedPlayUrl ? toAbsoluteMediaUrl(cachedPlayUrl) : src;
  const canUseAiAsk = false;
  const showAskPanel = false;

  const PREVIEW_SEEK_MS = 50;
  const PREVIEW_W = 160;
  const PREVIEW_H = 90;
  const youtubeVideoId = isYoutube ? extractYoutubeVideoId(rawSrc) : "";
  const youtubeThumb =
    item?.thumbnail ||
    (youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : "");

  const hintedDuration = Number(item?.duration) || 0;
  const hasVideoDuration = duration > 0 && Number.isFinite(duration);
  const showInitialLoader = Boolean(playbackSrc) && !hasVideoDuration && !isTelegramStream && !cachedPlayUrl;

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
          const { data } = await api.get(`/contents/${id}/local-library`);
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

  const handlePlaybackEnded = useCallback(async () => {
    setIsPlaying(false);
    setShowControls(true);
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

  useEffect(() => {
    if (!showInitialLoader) {
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
  }, [showInitialLoader]);

  useEffect(() => {
    if (!processingStartedAt) {
      setProcessingElapsedSec(0);
      return undefined;
    }
    setProcessingElapsedSec(Math.floor((Date.now() - processingStartedAt) / 1000));
    const interval = setInterval(() => {
      setProcessingElapsedSec(Math.floor((Date.now() - processingStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [processingStartedAt]);

  useEffect(() => {
    try {
      localStorage.setItem(VIDEO_PAGE_THEME_KEY, pageDark ? "dark" : "light");
    } catch {}
  }, [pageDark]);

  const handleTimelineMouseMove = useCallback(
    (e) => {
      if (!progressBarRef.current || !duration || duration <= 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = Math.max(0, Math.min(position * duration, duration - 0.01));
      hoverTimeRef.current = time;
      setTimelineHover({ time, position });

      if (previewSeekTimerRef.current) clearTimeout(previewSeekTimerRef.current);
      previewSeekTimerRef.current = setTimeout(() => {
        previewSeekTimerRef.current = null;
        const el = previewVideoRef.current;
        if (el) el.currentTime = hoverTimeRef.current;
      }, PREVIEW_SEEK_MS);
    },
    [duration]
  );

  const handleTimelineMouseLeave = useCallback(() => {
    if (previewSeekTimerRef.current) {
      clearTimeout(previewSeekTimerRef.current);
      previewSeekTimerRef.current = null;
    }
    setTimelineHover(null);
  }, []);

  const handleTimelineClick = useCallback(
    (e) => {
      if (!progressBarRef.current || !duration || duration <= 0 || !videoRef.current) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = Math.max(0, Math.min(position * duration, duration - 0.01));
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      resetControlsTimer();
    },
    [duration]
  );

  useEffect(() => {
    return () => {
      if (previewSeekTimerRef.current) clearTimeout(previewSeekTimerRef.current);
    };
  }, []);

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

  useEffect(() => {
    sessionStartRef.current = Date.now();
    return () => {
      const currentItem = itemRef.current;
      const mins = studyAccumSecondsRef.current / 60;
      const subjectId = currentItem?.subjectId?._id ?? currentItem?.subjectId;
      if (mins > 0) addStudyMinutes(mins, subjectId);
      if (currentItem && mins >= 1) {
        api
          .post("/mission/session/log", {
            type: "video",
            durationMinutes: Math.round(mins),
            contentId: currentItem._id,
            subjectId,
            subjectName: currentItem.subjectId?.name || "",
            meta: {
              title: currentItem.title,
              smoothPlayback: usingLocalLibraryRef.current,
            },
          })
          .catch(() => {});
      }
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

  useEffect(() => {
    const fetchAiOverview = async () => {
      if (!id || !canUseAiAsk) {
        setAiOverview(null);
        return;
      }
      setLoadingAi(true);
      try {
        const { data } = await api.get(`/contents/${id}/ai-overview`);
        setAiOverview(data);
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not load AI summary");
      } finally {
        setLoadingAi(false);
      }
    };
    fetchAiOverview();
  }, [id, canUseAiAsk]);

  const refreshAiSummary = async () => {
    if (!id || !canUseAiAsk) return;
    setAskErrorText("");
    setProcessingStartedAt(Date.now());
    setRefreshingAi(true);
    try {
      const maxRetries = 8;
      const retryDelayMs = 7000;
      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const { data } = await api.post(`/contents/${id}/ai-refresh`, {}, { timeout: 120000 });
          setAiOverview(data);
          setAskStatusText("");
          setProcessingStartedAt(null);
          toast.success("AI summary generated");
          return;
        } catch (error) {
          lastError = error;
          if (isGeminiProcessingError(error) && attempt < maxRetries) {
            const left = maxRetries - attempt;
            setAskStatusText(`Video still processing... retrying in ${retryDelayMs / 1000}s (${left} retries left)`);
            await wait(retryDelayMs);
            continue;
          }
          throw error;
        }
      }

      throw lastError || new Error("Could not generate AI summary");
    } catch (error) {
      const message = getApiErrorMessage(error, "Could not generate AI summary");
      setAskErrorText(message);
      toast.error(message);
    } finally {
      setProcessingStartedAt(null);
      if (!askingAi) setAskStatusText("");
      setRefreshingAi(false);
    }
  };

  const submitAsk = async (promptText) => {
    const question = String(promptText || askInput).trim();
    if (!question || !id || !canUseAiAsk || askingAi) return;
    setAskErrorText("");
    setAskStatusText("Thinking...");
    const historyForApi = askMessages.map((m) => ({ role: m.role, text: m.text }));
    const nextMessages = [...askMessages, { role: "user", text: question }];
    setAskMessages(nextMessages);
    setAskInput("");
    setAskingAi(true);
    setProcessingStartedAt(Date.now());
    const startedAt = Date.now();
    const statusTimer = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      if (elapsedSec < 8) {
        setAskStatusText("Thinking...");
      } else if (elapsedSec < 25) {
        setAskStatusText("Preparing video context...");
      } else {
        setAskStatusText("Still processing. First run on uploaded videos can take longer.");
      }
    }, 1000);
    try {
      const maxRetries = 10;
      const retryDelayMs = 7000;
      let data = null;
      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const response = await api.post(
            `/contents/${id}/ai-ask`,
            {
              question,
              history: historyForApi,
            },
            {
              timeout: 120000,
            }
          );
          data = response.data;
          break;
        } catch (error) {
          lastError = error;
          if (isGeminiProcessingError(error) && attempt < maxRetries) {
            const left = maxRetries - attempt;
            setAskStatusText(`Video still processing... retrying in ${retryDelayMs / 1000}s (${left} retries left)`);
            await wait(retryDelayMs);
            continue;
          }
          throw error;
        }
      }

      if (!data) throw lastError || new Error("Ask failed");
      setAskMessages((prev) => [...prev, { role: "assistant", text: data.answer || "No answer returned." }]);
    } catch (error) {
      const message = getApiErrorMessage(error, "Ask failed");
      setAskErrorText(message);
      toast.error(message);
      setAskMessages((prev) => prev.filter((m, idx) => !(m.role === "user" && idx === prev.length - 1)));
    } finally {
      clearInterval(statusTimer);
      setAskStatusText("");
      setProcessingStartedAt(null);
      setAskingAi(false);
    }
  };

  const jumpToMoment = (timecode) => {
    const sec = parseTimecodeToSeconds(timecode);
    if (Number.isNaN(sec) || sec < 0) return;
    if (!isYoutube && !isTelegramLink && videoRef.current) {
      videoRef.current.currentTime = sec;
      setCurrentTime(sec);
      resetControlsTimer();
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

  const resetControlsTimer = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setShowControls(true);
    if (isFullscreen && !isScrubbing) {
      hideTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 1200);
      return;
    }
    if (isPlaying && !isScrubbing) {
      hideTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }
  };

  const seekBy = (delta) => {
    if (!videoRef.current) return;
    const next = Math.min(Math.max(videoRef.current.currentTime + delta, 0), duration || 0);
    videoRef.current.currentTime = next;
    setCurrentTime(next);
    resetControlsTimer();
  };

  const setVolumeLevel = (nextVolume) => {
    if (!videoRef.current) return;
    const normalized = Math.min(Math.max(nextVolume, 0), 1);
    videoRef.current.volume = normalized;
    videoRef.current.muted = normalized === 0;
    setVolume(normalized);
    setIsMuted(normalized === 0);
  };

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      await videoRef.current.play();
      setIsPlaying(true);
      resetControlsTimer();
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  };

  const toggleFullscreen = async () => {
    if (!playerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await playerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      toast.error("Fullscreen not available");
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
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error("Video is not ready for screenshot yet.");
      return;
    }

    setCapturePending(true);
    try {
      const canvas = document.createElement("canvas");
      const maxWidth = 1280;
      const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
      canvas.width = Math.floor(video.videoWidth * scale);
      canvas.height = Math.floor(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not capture frame");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/jpeg", 0.82);

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
    } catch {
      toast.error("Could not capture screenshot");
    } finally {
      setCapturePending(false);
    }
  };

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

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const key = event.key.toLowerCase();
      if (isYoutube || isTelegramLink) return;

      if (key === "arrowleft") {
        event.preventDefault();
        seekBy(-5);
      } else if (key === "arrowright") {
        event.preventDefault();
        seekBy(5);
      } else if (key === "j") {
        event.preventDefault();
        seekBy(-10);
      } else if (key === "l") {
        event.preventDefault();
        seekBy(10);
      } else if (key === "arrowup") {
        event.preventDefault();
        setVolumeLevel((videoRef.current?.volume ?? volume) + 0.1);
      } else if (key === "arrowdown") {
        event.preventDefault();
        setVolumeLevel((videoRef.current?.volume ?? volume) - 0.1);
      } else if (event.key === " " || key === "k") {
        event.preventDefault();
        togglePlay();
      } else if (key === "m") {
        event.preventDefault();
        if (!videoRef.current) return;
        const nextMuted = !videoRef.current.muted;
        videoRef.current.muted = nextMuted;
        setIsMuted(nextMuted);
      } else if (key === "f") {
        event.preventDefault();
        toggleFullscreen();
      } else if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        if (!videoRef.current || !duration) return;
        const pct = Number(key) / 10;
        const next = duration * pct;
        videoRef.current.currentTime = next;
        setCurrentTime(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isYoutube, isTelegramLink, duration, volume, isPlaying]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      resetControlsTimer();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className={`page-viewer ${isDark ? "bg-black text-slate-100" : "bg-slate-100 text-slate-800"}`}>
      <div className="mx-auto max-w-[1400px] space-y-3 sm:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Link to="/" className="btn-secondary inline-flex text-sm">
              <FiArrowLeft /> Back
            </Link>
            <StudyTracker compact />
          </div>
          <button
            type="button"
            className="btn-secondary inline-flex rounded-xl p-2.5"
            onClick={() => setPageDark((d) => !d)}
            aria-label="Dark mode for this page"
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? <FiSun size={18} /> : <FiMoon size={18} />}
          </button>
        </div>
        <div
          className={`rounded-2xl border p-3 sm:p-5 ${
            isDark
              ? "border-neutral-800 bg-black"
              : "border-slate-200 bg-white"
          }`}
        >
          {!item ? (
            <div className="py-16 text-center text-sm text-slate-400 sm:py-20">Loading video...</div>
          ) : (
            <>
              <h1 className="text-lg font-semibold sm:text-2xl">{item.title}</h1>
              <p className={`text-xs sm:text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {item.subjectId?.name} / {item.chapterId?.chapterName}
              </p>
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
              <div className="mt-4">
                <div className="rounded-xl bg-black overflow-visible">
                {isTelegramLink ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
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
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
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
                ) : !playbackSourceReady && isLocalFrontend() && isTelegramStream && canCachePlayback ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                      <FiLoader className="animate-spin text-white" size={28} />
                      <p className="text-sm text-slate-300">Checking PC library…</p>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={playerRef}
                    className={`group relative overflow-visible ${showControls ? "cursor-default" : "cursor-none"}`}
                    onMouseMove={resetControlsTimer}
                    onMouseEnter={resetControlsTimer}
                    onMouseLeave={() => {
                      if (isPlaying) setShowControls(false);
                    }}
                  >
                    <div className="overflow-hidden rounded-xl relative">
                    <video
                      key={playbackSrc}
                      ref={videoRef}
                      className="aspect-video w-full"
                      src={playbackSrc}
                      controls={false}
                      preload="auto"
                      playsInline
                      onLoadStart={() => {
                        setBufferPercent(0);
                        loadStartedAtRef.current = Date.now();
                        const hint = Number(itemRef.current?.duration) || 0;
                        const telegram = itemRef.current
                          ? isTelegramStreamContent(itemRef.current)
                          : false;
                        if (!telegram || hint <= 0) {
                          setDuration(0);
                        }
                      }}
                      onLoadedMetadata={(e) => {
                        const video = e.currentTarget;
                        applyVideoDuration(video);
                        setVolume(video.volume);
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
                      }}
                      onDurationChange={(e) => {
                        applyVideoDuration(e.currentTarget);
                        updateBufferProgress(e.currentTarget);
                      }}
                      onProgress={(e) => updateBufferProgress(e.currentTarget)}
                      onError={() => {
                        const tryLocalFallback = async () => {
                          if (usingLocalLibraryRef.current || cachedPlayUrl) {
                            toast.error("Local video file failed to load.");
                            return;
                          }
                          if (!isLocalFrontend() || !canCachePlayback || !id) {
                            toast.error("Video failed to load. Check Telegram connection and refresh.");
                            return;
                          }
                          try {
                            const { data } = await api.get(`/contents/${id}/local-library`);
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
                      }}
                      onTimeUpdate={(e) => {
                        const t = e.currentTarget.currentTime;
                        setCurrentTime(t);
                        if (e.currentTarget.paused) return;
                        const prev = prevVideoTimeRef.current;
                        const delta = Math.max(0, Math.min(2, t - prev));
                        prevVideoTimeRef.current = t;
                        studyAccumSecondsRef.current += delta;
                        if (studyAccumSecondsRef.current >= 60) {
                          const sid = itemRef.current?.subjectId?._id ?? itemRef.current?.subjectId;
                          addStudyMinutes(studyAccumSecondsRef.current / 60, sid);
                          studyAccumSecondsRef.current = 0;
                        }
                        if (id && t - lastSavedPositionRef.current >= SAVE_INTERVAL_SECONDS) {
                          lastSavedPositionRef.current = t;
                          saveVideoPosition(id, t);
                        }
                      }}
                      onPlay={() => {
                        setIsPlaying(true);
                        resetControlsTimer();
                      }}
                      onPause={() => {
                        setIsPlaying(false);
                        setShowControls(true);
                        if (id && videoRef.current) {
                          saveVideoPosition(id, videoRef.current.currentTime);
                        }
                      }}
                      onEnded={handlePlaybackEnded}
                      onClick={togglePlay}
                      onDoubleClick={toggleFullscreen}
                    >
                      <track kind="captions" />
                    </video>

                    {showInitialLoader && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center">
                        <FiLoader className="animate-spin text-3xl text-teal-400" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white">Loading video…</p>
                          <p className="text-xs tabular-nums text-slate-300">
                            Waiting for duration · {formatTime(loadElapsedSec)} elapsed
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
                      </div>
                    )}
                    </div>

                    {!showInitialLoader && (
                    <div
                      className={`absolute bottom-0 left-0 right-0 z-10 overflow-visible bg-linear-to-t from-black/75 to-transparent p-3 transition ${
                        showControls || !isPlaying ? "opacity-100" : "pointer-events-none opacity-0"
                      }`}
                    >
                      <div
                        ref={progressBarRef}
                        className={`video-timeline relative overflow-visible cursor-pointer ${timelineHover ? "timeline-hovered" : ""}`}
                        style={{
                          "--progress-pct": duration ? `${(currentTime / duration) * 100}%` : "0%",
                        }}
                        onMouseMove={handleTimelineMouseMove}
                        onMouseLeave={handleTimelineMouseLeave}
                        onClick={handleTimelineClick}
                      >
                        <input
                          type="range"
                          min="0"
                          max={duration || 0}
                          step="0.1"
                          value={Math.min(currentTime, duration || 0)}
                          onMouseDown={() => setIsScrubbing(true)}
                          onMouseUp={() => {
                            setIsScrubbing(false);
                            resetControlsTimer();
                          }}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            if (!videoRef.current) return;
                            videoRef.current.currentTime = next;
                            setCurrentTime(next);
                            resetControlsTimer();
                          }}
                          className="yt-range w-full"
                        />
                        {!isYoutube && !isTelegramLink && timelineHover && duration > 0 && src && (
                          <div
                            className="absolute z-30 flex flex-col items-center pointer-events-none shrink-0"
                            style={{
                              left: `${timelineHover.position * 100}%`,
                              bottom: "100%",
                              transform: "translateX(-50%)",
                              marginBottom: "10px",
                              width: PREVIEW_W,
                              minWidth: PREVIEW_W,
                              maxWidth: PREVIEW_W,
                            }}
                          >
                            <div
                              className="rounded-lg overflow-hidden border-2 border-white/90 bg-black shadow-xl ring-2 ring-black/20 shrink-0"
                              style={{ width: PREVIEW_W, height: PREVIEW_H, minWidth: PREVIEW_W, minHeight: PREVIEW_H }}
                            >
                              <video
                                ref={previewVideoRef}
                                src={src}
                                muted
                                preload="auto"
                                playsInline
                                className="block object-contain bg-black w-full h-full"
                                style={{ width: PREVIEW_W, height: PREVIEW_H, minWidth: PREVIEW_W, minHeight: PREVIEW_H }}
                              />
                            </div>
                            <span className="mt-1.5 rounded bg-black/90 px-2 py-1 text-xs font-semibold text-white shadow-lg whitespace-nowrap">
                              {formatTime(timelineHover.time)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-y-2 text-xs text-slate-200">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button type="button" className="rounded p-1.5 hover:bg-white/20 sm:p-1" onClick={togglePlay}>
                            {isPlaying ? <FiPause /> : <FiPlay />}
                          </button>
                          <span className="tabular-nums text-[11px] sm:text-xs">
                            {formatTime(currentTime)} / {formatTime(duration)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2">
                          <button
                            type="button"
                            className="rounded p-1.5 hover:bg-white/20 sm:p-1"
                            onClick={handleCaptureScreenshot}
                            disabled={capturePending}
                            title="Save screenshot note"
                          >
                            <FiCamera />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1.5 hover:bg-white/20 sm:p-1"
                            onClick={() => {
                              if (!videoRef.current) return;
                              const nextMuted = !isMuted;
                              videoRef.current.muted = nextMuted;
                              setIsMuted(nextMuted);
                            }}
                          >
                            {isMuted || volume === 0 ? <FiVolumeX /> : <FiVolume2 />}
                          </button>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMuted ? 0 : volume}
                            onChange={(e) => {
                              setVolumeLevel(Number(e.target.value));
                              resetControlsTimer();
                            }}
                            className="video-volume-slider yt-volume-range w-16 sm:w-24"
                          />
                          <div className="relative" ref={settingsRef}>
                            <button
                              type="button"
                              className="rounded p-1 hover:bg-white/20"
                              onClick={() => setShowSettings((prev) => !prev)}
                            >
                              <FiSettings />
                            </button>
                            {showSettings && (
                              <div className="absolute bottom-8 right-0 w-28 rounded-md bg-black/90 p-1">
                                {[0.5, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                                  <button
                                    key={rate}
                                    type="button"
                                    className={`block w-full rounded px-2 py-1 text-left text-xs ${
                                      playbackRate === rate ? "bg-white/20 text-white" : "text-slate-200 hover:bg-white/10"
                                    }`}
                                    onClick={() => {
                                      if (!videoRef.current) return;
                                      videoRef.current.playbackRate = rate;
                                      setPlaybackRate(rate);
                                      setShowSettings(false);
                                    }}
                                  >
                                    {rate}x
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button type="button" className="rounded p-1 hover:bg-white/20" onClick={toggleFullscreen}>
                            {isFullscreen ? <FiMinimize /> : <FiMaximize />}
                          </button>
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                )}
                </div>

                {showAskPanel && (
                <aside
                  className="rounded-2xl border border-white/10 bg-[#1f1f1f] p-3 text-slate-100 shadow-2xl"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="inline-flex items-center gap-2 text-base font-semibold">
                      <FiMessageCircle size={14} />
                      Ask about this video
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-100 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={refreshAiSummary}
                        disabled={!canUseAiAsk || refreshingAi}
                      >
                        <FiRefreshCw className={refreshingAi ? "animate-spin" : ""} />
                        {refreshingAi ? "Generating..." : "Generate"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
                        onClick={() => setAskPanelOpen((v) => !v)}
                        aria-label="Toggle ask panel"
                      >
                        <FiX size={14} />
                      </button>
                    </div>
                  </div>

                  {!canUseAiAsk && (
                    <p className="mt-2 text-xs text-slate-400">
                      Ask is available for video lessons only.
                    </p>
                  )}

                  {canUseAiAsk && askPanelOpen && (
                    <>
                      <div
                        className="mt-3 rounded-xl border border-white/10 bg-[#232323] p-3"
                      >
                        <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                          <FiZap size={12} />
                          Summary
                        </p>
                        {loadingAi ? (
                          <p className="mt-2 text-xs text-slate-400">Loading summary...</p>
                        ) : aiOverview?.ready ? (
                          <>
                            <p className="mt-2 text-sm leading-6 text-slate-100">
                              {aiOverview.shortSummary}
                            </p>
                            {!!aiOverview?.keyMoments?.length && (
                              <div className="mt-3 space-y-1">
                                {aiOverview.keyMoments.slice(0, 5).map((moment, index) => (
                                  <button
                                    key={`${moment.timecode}-${index}`}
                                    type="button"
                                    onClick={() => jumpToMoment(moment.timecode)}
                                    className="flex w-full items-center gap-2 text-left text-xs transition hover:opacity-90"
                                  >
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-slate-200">
                                      <FiClock size={10} />
                                      {moment.timecode}
                                    </span>
                                    <span className="text-slate-300">{moment.title}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">
                            Click Generate to create the video summary.
                          </p>
                        )}
                      </div>

                      <div className="mt-3 rounded-xl border border-white/10 bg-[#232323]">
                        <div className="max-h-[330px] space-y-2 overflow-y-auto p-3">
                          {!askMessages.length ? (
                            <div className="space-y-2">
                              <button
                                type="button"
                                className="ml-auto block rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-900"
                                onClick={() => submitAsk("Give me the full summary in simple points")}
                              >
                                Summarize the video
                              </button>
                            </div>
                          ) : (
                            askMessages.map((msg, index) => (
                              <div
                                key={`${msg.role}-${index}`}
                                className={`rounded-xl px-3 py-2 text-sm leading-6 ${
                                  msg.role === "user"
                                    ? "ml-auto max-w-[90%] bg-white text-slate-900"
                                    : "max-w-[95%] bg-transparent text-slate-100"
                                }`}
                              >
                                {renderWithTimeHighlights(msg.text)}
                              </div>
                            ))
                          )}
                          {askingAi && (
                            <p className="text-xs text-slate-400">{askStatusText || "Thinking..."}</p>
                          )}
                          {(askingAi || refreshingAi) && (
                            <p className="text-[11px] text-slate-500">
                              Elapsed: {formatElapsed(processingElapsedSec)} | Typical local timestamp run: 00:05-00:30
                            </p>
                          )}
                          {!askingAi && !!askErrorText && (
                            <p className="text-xs text-rose-400">{askErrorText}</p>
                          )}
                        </div>
                        <form
                          className="border-t border-white/10 p-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitAsk();
                          }}
                        >
                          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#2a2a2a] px-3 py-2">
                            <input
                              className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                              placeholder="Ask a question..."
                              value={askInput}
                              onChange={(e) => setAskInput(e.target.value)}
                              disabled={!canUseAiAsk || askingAi}
                            />
                            <button
                              type="submit"
                              className="rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                              disabled={!askInput.trim() || askingAi || !canUseAiAsk}
                            >
                              <FiSend size={16} />
                            </button>
                          </div>
                        </form>
                        <div className="pb-2 text-center text-[10px] text-slate-500">
                          AI can make mistakes, so double-check it.
                        </div>
                      </div>
                    </>
                  )}
                </aside>
                )}
              </div>
            </>
          )}

          <div
            className={`mt-4 rounded-xl border p-3 ${
              isDark
                ? "border-neutral-800 bg-black"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <h2 className="text-sm font-semibold">Chapter PDFs</h2>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Quick notes for this video chapter.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {loadingPdfs && <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Loading PDFs…</p>}
              {!loadingPdfs && !relatedPdfs.length && (
                <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  No PDF found in this chapter yet.
                </p>
              )}
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

          <div
            className={`mt-4 rounded-xl border p-3 ${
              isDark
                ? "border-neutral-800 bg-black"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold">Screenshot Notes</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1 text-xs sm:flex-none"
                  onClick={handleDownloadAllScreenshotsPdf}
                  disabled={exportingPdf || !screenshotNotes.length}
                >
                  <FiDownload size={13} />
                  {exportingPdf ? "Generating PDF..." : "Download PDF"}
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1 text-xs sm:flex-none"
                  onClick={handleCaptureScreenshot}
                  disabled={capturePending}
                >
                  <FiCamera size={13} />
                  {capturePending ? "Saving..." : "Capture note"}
                </button>
              </div>
            </div>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Capture key frames while watching. Click image to open in new tab, or click timestamp to jump in video.
            </p>
            {(isYoutube || isTelegramLink) && (
              <p className="mt-2 text-xs text-sky-500 dark:text-sky-400">
                For externally hosted videos (YouTube, Telegram links): notes use thumbnails where available; use Capture when
                the video plays inside this page.
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerPage;
