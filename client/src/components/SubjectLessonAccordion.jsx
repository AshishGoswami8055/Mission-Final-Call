import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiCircle,
  FiEdit2,
  FiFileText,
  FiLoader,
  FiPlayCircle,
  FiTrash2,
  FiVideo,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import api from "../api/client";
import LessonVideoDownload from "./LessonVideoDownload";
import { getContentDateLabels } from "../utils/contentDates";
import { canLocalLibraryDownload, isLocalFrontend, isTelegramLinkVideo } from "../utils/media";

import { sortSubjectContents } from "../utils/contentSort";

const BADGE_CLASS =
  "ml-2 inline-flex shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";

const NewBadge = ({ item }) => {
  const { isNew } = getContentDateLabels(item);
  if (!isNew) return null;
  return <span className={BADGE_CLASS}>New</span>;
};

const sortContents = (items, chapters) => sortSubjectContents(items, chapters);

const LessonList = ({
  items,
  type,
  expandedId,
  onToggle,
  onDeleteContent,
  onRenameContent,
  deletingContentId,
  pcCachedIds = new Set(),
  showDownload = false,
  onPcCached,
  onToggleCompleted,
  togglingCompletedId = null,
  onReorderContent,
  reorderingContentId = null,
  emptyMessage,
}) => {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  const startRename = (item, event) => {
    event.stopPropagation();
    setRenamingId(item._id);
    setRenameValue(item.title || "");
  };

  const cancelRename = (event) => {
    event?.stopPropagation?.();
    setRenamingId(null);
    setRenameValue("");
  };

  const saveRename = async (item, event) => {
    event?.stopPropagation?.();
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;
    if (nextTitle === item.title) {
      cancelRename();
      return;
    }
    if (!onRenameContent) return;
    setSavingRename(true);
    try {
      await onRenameContent(item, nextTitle);
      setRenamingId(null);
      setRenameValue("");
    } finally {
      setSavingRename(false);
    }
  };

  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
        {emptyMessage ||
          `No ${type === "video" ? "videos" : "PDFs"} in this subject yet.`}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-[#1a1a1a] md:hidden">
        {items.map((item, index) => {
          const rowType = item.type || type || "video";
          const route = rowType === "video" ? `/video/${item._id}` : `/pdf/${item._id}`;
          const isExternalTelegram = rowType === "video" && isTelegramLinkVideo(item);
          const chapterName = item.chapterId?.chapterName || "General";
          const { posted } = getContentDateLabels(item);
          const href = isExternalTelegram ? item.videoUrl || item.url : route;
          const RowTag = isExternalTelegram ? "a" : Link;
          const rowProps = isExternalTelegram
            ? { href, target: "_blank", rel: "noopener noreferrer" }
            : { to: route };

          return (
            <RowTag
              key={item._id}
              {...rowProps}
              className={`mobile-lesson-row ${item.completed ? "opacity-80" : ""}`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  rowType === "video"
                    ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                }`}
              >
                {rowType === "video" ? <FiPlayCircle size={16} /> : <FiFileText size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {index + 1}. {item.title}
                  <NewBadge item={item} />
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                  {chapterName}
                  {posted ? ` · ${posted}` : ""}
                </span>
              </span>
              {item.completed ? (
                <FiCheckCircle size={16} className="shrink-0 text-emerald-500" aria-label="Done" />
              ) : null}
              <FiChevronDown size={16} className="-rotate-90 shrink-0 text-slate-400" />
            </RowTag>
          );
        })}
      </div>

      <div className="hidden space-y-2 md:block">
      {items.map((item, index) => {
        const isOpen = expandedId === item._id;
        const rowType = item.type || type || "video";
        const route = rowType === "video" ? `/video/${item._id}` : `/pdf/${item._id}`;
        const isExternalTelegram = rowType === "video" && isTelegramLinkVideo(item);
        const chapterName = item.chapterId?.chapterName || "General";
        const { posted } = getContentDateLabels(item);
        const onPc = pcCachedIds.has(String(item._id));
        const canDownload = showDownload && rowType === "video" && canLocalLibraryDownload(item);

        return (
          <div
            key={item._id}
            className={`overflow-hidden rounded-xl border bg-white dark:bg-[#1a1a1a] ${
              item.completed
                ? "border-emerald-200/80 dark:border-emerald-900/40"
                : "border-slate-200/90 dark:border-white/10"
            }`}
          >
            <div className="flex items-start gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-start gap-2.5 text-left transition hover:opacity-90 sm:gap-3"
                onClick={() => onToggle(isOpen ? null : item._id)}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    rowType === "video"
                      ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  }`}
                >
                  {rowType === "video" ? <FiPlayCircle size={16} /> : <FiFileText size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  {renamingId === item._id ? (
                    <div
                      className="flex flex-wrap items-center gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        className="input min-w-0 flex-1 py-1.5 text-sm"
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        autoFocus
                        disabled={savingRename}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveRename(item, event);
                          if (event.key === "Escape") cancelRename(event);
                        }}
                      />
                      <button
                        type="button"
                        className="btn-primary px-3 py-1.5 text-xs"
                        disabled={savingRename || !renameValue.trim()}
                        onClick={(event) => saveRename(item, event)}
                      >
                        {savingRename ? <FiLoader size={12} className="animate-spin" /> : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1.5 text-xs"
                        disabled={savingRename}
                        onClick={cancelRename}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <span className={`truncate ${item.completed ? "text-emerald-800 dark:text-emerald-200" : ""}`}>
                          {index + 1}. {item.title}
                        </span>
                        <NewBadge item={item} />
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="truncate">{chapterName}</span>
                        {posted && (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span className="shrink-0">Posted {posted}</span>
                          </>
                        )}
                      </span>
                    </>
                  )}
                </span>
              </button>

              {renamingId !== item._id && (
                <div className="flex shrink-0 items-start gap-0.5 sm:gap-1">
                  {onToggleCompleted && (
                    <button
                      type="button"
                      aria-label={item.completed ? "Mark as not done" : "Mark as done"}
                      title={item.completed ? "Completed — click to undo" : "Mark as done"}
                      disabled={togglingCompletedId === item._id}
                      className={`rounded-lg p-2 transition ${
                        item.completed
                          ? "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleCompleted(item);
                      }}
                    >
                      {togglingCompletedId === item._id ? (
                        <FiLoader size={15} className="animate-spin" />
                      ) : item.completed ? (
                        <FiCheckCircle size={15} />
                      ) : (
                        <FiCircle size={15} />
                      )}
                    </button>
                  )}
                  {canDownload && (
                    <LessonVideoDownload
                      contentId={item._id}
                      initiallyCached={onPc}
                      onCached={onPcCached}
                    />
                  )}
                  {onReorderContent && (
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={`Move ${item.title} up`}
                        title="Move up"
                        disabled={
                          index === 0 ||
                          reorderingContentId === item._id ||
                          Boolean(reorderingContentId)
                        }
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-slate-200"
                        onClick={(event) => {
                          event.stopPropagation();
                          onReorderContent(item, "up");
                        }}
                      >
                        {reorderingContentId === item._id ? (
                          <FiLoader size={13} className="animate-spin" />
                        ) : (
                          <FiChevronUp size={15} />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${item.title} down`}
                        title="Move down"
                        disabled={
                          index === items.length - 1 ||
                          reorderingContentId === item._id ||
                          Boolean(reorderingContentId)
                        }
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-slate-200"
                        onClick={(event) => {
                          event.stopPropagation();
                          onReorderContent(item, "down");
                        }}
                      >
                        <FiChevronDown size={15} />
                      </button>
                    </div>
                  )}
                  {onRenameContent && (
                    <button
                      type="button"
                      aria-label={`Rename ${item.title}`}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                      onClick={(event) => startRename(item, event)}
                    >
                      <FiEdit2 size={15} />
                    </button>
                  )}
                  {onDeleteContent && (
                    <button
                      type="button"
                      aria-label={`Delete ${item.title}`}
                      disabled={deletingContentId === item._id}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteContent(item);
                      }}
                    >
                      {deletingContentId === item._id ? (
                        <FiLoader size={15} className="animate-spin" />
                      ) : (
                        <FiTrash2 size={15} />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
                    onClick={() => onToggle(isOpen ? null : item._id)}
                  >
                    <FiChevronDown
                      size={18}
                      className={`transition ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>
              )}
            </div>

            {isOpen && (
              <div className="border-t border-slate-100 px-4 py-3 dark:border-white/10">
                {isExternalTelegram ? (
                  <a
                    href={item.videoUrl || item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-teal-600"
                  >
                    <FiVideo size={15} /> Open in Telegram
                  </a>
                ) : (
                  <Link
                    to={route}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-teal-600"
                  >
                    {rowType === "video" ? <FiPlayCircle size={15} /> : <FiFileText size={15} />}
                    {rowType === "video" ? "Watch Class" : "Open PDF"}
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </>
  );
};

const SubjectLessonAccordion = ({
  contents = [],
  chapters = [],
  subjectId = null,
  onDeleteContent,
  onRenameContent,
  deletingContentId = null,
  onToggleCompleted,
  togglingCompletedId = null,
  onReorderContent,
  reorderingContentId = null,
}) => {
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState("videos");
  const [pcCachedIds, setPcCachedIds] = useState(new Set());
  const showDownload = isLocalFrontend();

  const handlePcCached = useCallback((contentId) => {
    setPcCachedIds((prev) => new Set([...prev, String(contentId)]));
  }, []);

  const videos = useMemo(
    () => sortContents(contents.filter((c) => c.type === "video"), chapters),
    [contents, chapters]
  );
  const pdfs = useMemo(
    () => sortContents(contents.filter((c) => c.type === "pdf"), chapters),
    [contents, chapters]
  );

  useEffect(() => {
    setActiveTab(videos.length ? "videos" : "pdfs");
    setExpandedId(null);
  }, [subjectId, videos.length, pdfs.length]);

  useEffect(() => {
    if (!showDownload || !subjectId) {
      setPcCachedIds(new Set());
      return;
    }
    let cancelled = false;
    const loadCached = async () => {
      try {
        const { data } = await api.get(`/subjects/${subjectId}/local-library/cached`);
        if (!cancelled) setPcCachedIds(new Set(data.cachedIds || []));
      } catch {
        if (!cancelled) setPcCachedIds(new Set());
      }
    };
    loadCached();
    return () => {
      cancelled = true;
    };
  }, [subjectId, showDownload, contents.length]);

  if (!videos.length && !pdfs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-[#1a1a1a]">
        <p className="text-sm text-slate-500 dark:text-slate-400">No lessons in this subject yet.</p>
      </div>
    );
  }

  const tabs = [
    { id: "videos", label: "Videos", count: videos.length, icon: FiPlayCircle, accent: "bg-sky-700" },
    { id: "pdfs", label: "PDFs", count: pdfs.length, icon: FiFileText, accent: "bg-amber-600" },
  ];

  const currentTab =
    activeTab === "videos" && !videos.length
      ? "pdfs"
      : activeTab === "pdfs" && !pdfs.length
        ? "videos"
        : activeTab;

  const listProps = {
    expandedId,
    onToggle: setExpandedId,
    onDeleteContent,
    onRenameContent,
    deletingContentId,
    pcCachedIds,
    showDownload,
    onPcCached: handlePcCached,
    onToggleCompleted,
    togglingCompletedId,
    onReorderContent,
    reorderingContentId,
  };

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 md:flex-wrap md:gap-2 md:overflow-visible md:pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const disabled = tab.count === 0;
          const mobileLabel = tab.id === "videos" ? "Videos" : "PDFs";
          return (
            <button
              key={tab.id}
              type="button"
              disabled={disabled}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition md:gap-2 md:px-4 md:text-sm ${
                currentTab === tab.id
                  ? `${tab.accent} text-white shadow`
                  : disabled
                    ? "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-600"
                    : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"
              }`}
            >
              <Icon size={14} />
              <span className="md:hidden">{mobileLabel}</span>
              <span className="hidden md:inline">{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  currentTab === tab.id ? "bg-white/20" : "bg-white/60 dark:bg-black/20"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {currentTab === "videos" ? (
        <LessonList items={videos} type="video" {...listProps} />
      ) : (
        <LessonList items={pdfs} type="pdf" {...listProps} />
      )}
    </div>
  );
};

export default SubjectLessonAccordion;
