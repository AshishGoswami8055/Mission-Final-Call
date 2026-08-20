import { useCallback, useEffect, useState } from "react";
import { FiExternalLink, FiPauseCircle, FiYoutube } from "react-icons/fi";
import { useStudy } from "../context/StudyContext";
import {
  loadActiveYoutubeTrack,
  stopYoutubeExternalTrack,
} from "../utils/youtubeExternalTrack";

const formatMinutes = (m) => {
  const mins = Math.floor(Number(m) || 0);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m`;
};

const YoutubeExternalTrackBar = () => {
  const { todayMinutes, applyVideoStreakStatus } = useStudy();
  const [active, setActive] = useState(() => loadActiveYoutubeTrack());

  const syncActive = useCallback(() => {
    setActive(loadActiveYoutubeTrack());
  }, []);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== window || !event.data?.type) return;
      if (
        event.data.type === "CDS_YT_TRACK_STARTED" ||
        event.data.type === "CDS_YT_TRACK_STOPPED"
      ) {
        syncActive();
      }
      if (event.data.type === "CDS_YT_TRACK_TICK" && event.data.streak) {
        applyVideoStreakStatus(event.data.streak);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [syncActive, applyVideoStreakStatus]);

  if (!active) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[200] flex w-[min(92vw,28rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-red-500/30 bg-[#141414]/95 px-4 py-3 text-sm text-white shadow-lg backdrop-blur">
      <FiYoutube className="shrink-0 text-red-400" size={18} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">Tracking on YouTube</p>
        <p className="truncate text-xs text-slate-400">{active.title || "Study video"}</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
          Today {formatMinutes(todayMinutes)} · pauses when video pauses
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        {active.youtubeUrl ? (
          <a
            href={active.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-medium hover:bg-white/10"
          >
            <FiExternalLink size={12} />
            YouTube
          </a>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-medium hover:bg-white/15"
          onClick={() => {
            stopYoutubeExternalTrack();
            syncActive();
          }}
        >
          <FiPauseCircle size={12} />
          Stop
        </button>
      </div>
    </div>
  );
};

export default YoutubeExternalTrackBar;
