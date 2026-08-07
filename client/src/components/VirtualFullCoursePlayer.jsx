import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiLoader } from "react-icons/fi";
import CdsPlyrPlayer from "./CdsPlyrPlayer";
import { resolveVideoPlaybackUrl } from "../utils/media";

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

const VirtualFullCoursePlayer = ({
  subjectId,
  chapters = [],
  initialGlobalTime = 0,
  onGlobalTimeUpdate,
  onGlobalTimeSave,
  videoRef: externalVideoRef,
}) => {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapterDurations, setChapterDurations] = useState(() =>
    chapters.map((chapter) => Number(chapter.durationSeconds) || 0)
  );
  const [globalTime, setGlobalTime] = useState(Math.max(0, initialGlobalTime));
  const [seeking, setSeeking] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [playbackError, setPlaybackError] = useState("");

  const internalVideoRef = useRef(null);
  const pendingSeekRef = useRef(null);
  const chapterIndexRef = useRef(0);
  const chaptersRef = useRef(chapters);
  const chapterDurationsRef = useRef(chapterDurations);
  const globalTimeRef = useRef(globalTime);
  const seekingRef = useRef(false);
  const autoPlayRef = useRef(true);

  chaptersRef.current = chapters;
  chapterDurationsRef.current = chapterDurations;
  chapterIndexRef.current = chapterIndex;
  globalTimeRef.current = globalTime;
  seekingRef.current = seeking;

  const videoRef = externalVideoRef || internalVideoRef;

  const totalDuration = useMemo(
    () =>
      chapterDurations.reduce(
        (sum, value, index) => sum + (value || Number(chapters[index]?.durationSeconds) || 0),
        0
      ),
    [chapterDurations, chapters]
  );

  const chapterStarts = useMemo(() => {
    const starts = [];
    let acc = 0;
    for (let index = 0; index < chapters.length; index += 1) {
      starts.push(acc);
      acc += chapterDurations[index] || Number(chapters[index]?.durationSeconds) || 0;
    }
    return starts;
  }, [chapters, chapterDurations]);

  const globalToChapter = useCallback(
    (time) => {
      const safeTime = Math.max(0, Math.min(time, totalDuration || time));
      for (let index = 0; index < chapters.length; index += 1) {
        const dur = chapterDurations[index] || Number(chapters[index]?.durationSeconds) || 0;
        const end = chapterStarts[index] + dur;
        if (safeTime < end || index === chapters.length - 1) {
          return { index, localTime: Math.max(0, safeTime - chapterStarts[index]) };
        }
      }
      return { index: 0, localTime: 0 };
    },
    [chapterDurations, chapterStarts, chapters, totalDuration]
  );

  useEffect(() => {
    if (!chapters.length) return;
    const { index, localTime } = globalToChapter(initialGlobalTime);
    chapterIndexRef.current = index;
    setChapterIndex(index);
    pendingSeekRef.current = localTime;
    setGlobalTime(Math.max(0, initialGlobalTime));
    setPlaybackError("");
    setBuffering(true);
    autoPlayRef.current = true;
  }, [subjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentChapter = chapters[chapterIndex];
  const playbackSrc = currentChapter?.playUrl ? resolveVideoPlaybackUrl(currentChapter.playUrl) : "";

  useEffect(() => {
    if (!playbackSrc) {
      setPlaybackError("No video URL for this chapter");
      setBuffering(false);
      return;
    }
    setPlaybackError("");
    setBuffering(true);
  }, [playbackSrc, chapterIndex]);

  const applyPendingSeek = useCallback(() => {
    const video = videoRef.current;
    if (!video || pendingSeekRef.current == null) return;
    const target = pendingSeekRef.current;
    pendingSeekRef.current = null;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(target, Math.max(0, video.duration - 0.25));
    } else {
      video.currentTime = target;
    }
  }, [videoRef]);

  const loadChapterAt = useCallback((index, localTime = 0) => {
    pendingSeekRef.current = localTime;
    chapterIndexRef.current = index;
    setChapterIndex(index);
    setPlaybackError("");
    setBuffering(true);
    autoPlayRef.current = true;
  }, []);

  const seekGlobal = useCallback(
    (time) => {
      const { index, localTime } = globalToChapter(time);
      setGlobalTime(time);
      onGlobalTimeUpdate?.(time);
      if (index !== chapterIndexRef.current) {
        loadChapterAt(index, localTime);
      } else if (videoRef.current) {
        videoRef.current.currentTime = localTime;
      }
    },
    [globalToChapter, loadChapterAt, onGlobalTimeUpdate, videoRef]
  );

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setBuffering(false);
    const dur = Number(video.duration);
    if (Number.isFinite(dur) && dur > 0) {
      setChapterDurations((prev) => {
        const next = [...prev];
        next[chapterIndexRef.current] = dur;
        return next;
      });
    }
    applyPendingSeek();
    if (autoPlayRef.current) {
      autoPlayRef.current = false;
      void video.play().catch(() => {
        /* user can press play */
      });
    }
  }, [applyPendingSeek, videoRef]);

  const handleTimeUpdate = useCallback(() => {
    if (seekingRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    setBuffering(false);
    const start = chapterStarts[chapterIndexRef.current] || 0;
    const nextGlobal = start + video.currentTime;
    setGlobalTime(nextGlobal);
    onGlobalTimeUpdate?.(nextGlobal);
  }, [chapterStarts, onGlobalTimeUpdate, videoRef]);

  const handleEnded = useCallback(() => {
    const nextIndex = chapterIndexRef.current + 1;
    if (nextIndex >= chaptersRef.current.length) return;
    loadChapterAt(nextIndex, 0);
  }, [loadChapterAt]);

  const handleError = useCallback(() => {
    setBuffering(false);
    setPlaybackError(
      "Could not load this chapter from your PC. Open the lesson and use Replace with an MP4 file."
    );
  }, []);

  const handlePlay = useCallback(() => {
    setBuffering(false);
  }, []);

  useEffect(() => {
    if (!subjectId || !onGlobalTimeSave) return undefined;
    const interval = setInterval(() => {
      onGlobalTimeSave(globalTimeRef.current);
    }, 5000);
    return () => clearInterval(interval);
  }, [subjectId, onGlobalTimeSave]);

  if (!chapters.length || !currentChapter) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-black text-sm text-slate-400">
        No chapters available
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="cds-plyr-shell group relative aspect-video w-full overflow-hidden bg-black">
        {Boolean(playbackSrc) && !playbackError ? (
          <CdsPlyrPlayer
            key={`virtual-${subjectId}`}
            contentId={`virtual-full-${subjectId}`}
            src={playbackSrc}
            ready={Boolean(playbackSrc)}
            controlsPreset="minimal"
            autoPlay
            videoRef={videoRef}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onError={handleError}
            onPlay={handlePlay}
          />
        ) : null}

        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          Chapter {chapterIndex + 1}/{chapters.length}
          {currentChapter.title ? ` · ${currentChapter.title}` : ""}
        </div>

        {buffering && !playbackError ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/40">
            <FiLoader className="animate-spin text-2xl text-teal-400" />
            <p className="text-xs text-slate-300">
              {playbackSrc.includes("browser-playable")
                ? "Converting MKV to MP4 for browser (one-time, fast)…"
                : "Loading from your PC…"}
            </p>
          </div>
        ) : null}

        {playbackError ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black px-6 text-center">
            <p className="text-sm text-white">{playbackError}</p>
            {chapterIndex < chapters.length - 1 ? (
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => loadChapterAt(chapterIndex + 1, 0)}
              >
                Skip to next chapter
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 bg-black px-3 py-2.5">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>{formatClock(globalTime)}</span>
          <span className="text-teal-400/90">Instant play · from PC files</span>
          <span>{formatClock(totalDuration)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(1, totalDuration)}
          step={1}
          value={Math.min(globalTime, totalDuration || globalTime)}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-teal-500"
          onChange={(event) => {
            const next = Number(event.target.value);
            setSeeking(true);
            seekGlobal(next);
          }}
          onMouseUp={() => setSeeking(false)}
          onTouchEnd={() => setSeeking(false)}
          aria-label="Full course timeline"
        />
      </div>
    </div>
  );
};

export default VirtualFullCoursePlayer;
