import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { FiCheckCircle, FiCircle, FiEdit2, FiFileText, FiMoreVertical, FiPlayCircle, FiTrash2 } from "react-icons/fi";
import { Link } from "react-router-dom";
import {
  formatFileSize,
  getTelegramVideoUrl,
  isTelegramLinkVideo,
  isTelegramStreamContent,
  isYouTubeUrl,
  resolveContentSrc,
  toAbsoluteMediaUrl,
} from "../utils/media";

const formatDuration = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

const ContentCard = ({ item, onToggleCompleted, onDelete, onEdit }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const route = item.type === "video" ? `/video/${item._id}` : `/pdf/${item._id}`;
  const thumb = item.type === "video" && item.thumbnail ? toAbsoluteMediaUrl(item.thumbnail) : null;
  const previewTitle = item.chapterId?.chapterName || item.title;
  const pdfSrc = resolveContentSrc(item);
  const videoSrc = resolveContentSrc(item);
  const telegramLink = getTelegramVideoUrl(item);
  const isTelegramLink = isTelegramLinkVideo(item);
  const isTelegramStream = isTelegramStreamContent(item);
  const isCloudinary = item.sourceType === "cloudinary";
  const cloudBadge = isCloudinary && item.cloudType ? item.cloudType : null;
  const telegramBadge = isTelegramStream ? "Telegram" : null;
  const [durationLabel, setDurationLabel] = useState(null);
  const previewBackgroundClass =
    item.type === "video"
      ? "bg-linear-to-br from-blue-100 via-sky-50 to-indigo-100 dark:from-blue-900/40 dark:via-slate-900 dark:to-indigo-900/40"
      : "bg-linear-to-br from-amber-100 via-orange-50 to-rose-100 dark:from-amber-900/40 dark:via-slate-900 dark:to-rose-900/40";
  const previewLabelClass =
    item.type === "video" ? "text-blue-600 dark:text-blue-300" : "text-orange-600 dark:text-orange-300";

  useEffect(() => {
    if (item.type !== "video") {
      setDurationLabel(null);
      return;
    }

    if (Number.isFinite(item.duration) && item.duration > 0) {
      setDurationLabel(formatDuration(item.duration));
      return;
    }

    if (isTelegramLink) {
      setDurationLabel("Telegram link");
      return;
    }

    if (isTelegramStream && item.telegramFileSize) {
      setDurationLabel(formatFileSize(item.telegramFileSize));
      return;
    }

    if (!videoSrc) {
      setDurationLabel("--");
      return;
    }

    if (isYouTubeUrl(videoSrc)) {
      setDurationLabel("YouTube");
      return;
    }

    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = videoSrc;

    const onLoadedMetadata = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        setDurationLabel(formatDuration(probe.duration));
      } else {
        setDurationLabel("--");
      }
    };
    const onError = () => setDurationLabel("--");

    probe.addEventListener("loadedmetadata", onLoadedMetadata);
    probe.addEventListener("error", onError);

    return () => {
      probe.removeEventListener("loadedmetadata", onLoadedMetadata);
      probe.removeEventListener("error", onError);
      probe.src = "";
    };
  }, [item.type, videoSrc, item.duration]);

  return (
    <article className="card-hover group anim-fade-in-up overflow-hidden">
      <div className="relative">
        {thumb ? (
          <img
            src={thumb}
            alt={item.title}
            className="h-40 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className={`flex h-40 items-center justify-center border-b border-slate-200/80 p-4 text-center dark:border-slate-800 ${previewBackgroundClass}`}
          >
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${previewLabelClass}`}>
                {item.type === "video" ? "Video Lesson" : "PDF Notes"}
              </p>
              <p className="font-display mt-1.5 line-clamp-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
                {previewTitle}
              </p>
            </div>
          </div>
        )}

        {item.completed && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-600/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-md backdrop-blur">
            <FiCheckCircle size={12} /> Done
          </span>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
              {item.title}
            </h3>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {item.subjectId?.name} <span className="opacity-50">·</span> {item.chapterId?.chapterName}
            </p>
          </div>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              className="btn-ghost p-2!"
              aria-label="More actions"
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <FiMoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="anim-scale-in absolute right-0 z-10 mt-1 w-36 rounded-xl border border-slate-200/80 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(item);
                  }}
                >
                  <FiEdit2 size={14} /> Edit
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(item._id);
                  }}
                >
                  <FiTrash2 size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`pill ${item.type === "video" ? "pill-info" : "pill-warning"}`}>
            {item.type === "video" ? "Video" : "PDF"}
          </span>
          {cloudBadge && (
            <span className="pill-violet" title={`Streamed from ${cloudBadge}`}>
              {cloudBadge}
            </span>
          )}
          {telegramBadge && (
            <span className="pill-info" title="Streamed from Telegram">
              {telegramBadge}
            </span>
          )}
          {item.type === "video" && durationLabel && (
            <span className="pill-neutral tabular-nums">{durationLabel}</span>
          )}
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
            {format(new Date(item.createdAt), "dd MMM yyyy")}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {item.type === "pdf" ? (
            <a className="btn-primary flex-1 sm:flex-none" href={pdfSrc} target="_blank" rel="noreferrer">
              <FiFileText /> Open PDF
            </a>
          ) : isTelegramLink && telegramLink ? (
            <a
              className="btn-primary flex-1 sm:flex-none"
              href={telegramLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FiPlayCircle /> Open in Telegram
            </a>
          ) : (
            <Link className="btn-primary flex-1 sm:flex-none" to={route}>
              <FiPlayCircle /> Open
            </Link>
          )}
          <button
            type="button"
            className={`flex-1 sm:flex-none ${item.completed ? "btn-secondary" : "btn-secondary"}`}
            onClick={() => onToggleCompleted(item._id)}
          >
            {item.completed ? <FiCheckCircle className="text-emerald-500" /> : <FiCircle />}
            {item.completed ? "Completed" : "Mark done"}
          </button>
        </div>
      </div>
    </article>
  );
};

export default ContentCard;
