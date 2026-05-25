import { useEffect, useMemo, useState } from "react";
import {
  FiChevronDown,
  FiEdit2,
  FiFileText,
  FiHardDrive,
  FiLoader,
  FiPlayCircle,
  FiSparkles,
  FiTrash2,
  FiVideo,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import api from "../api/client";
import {
  filterRecentlyAdded,
  getContentDateLabels,
  NEW_CONTENT_DAYS,
} from "../utils/contentDates";
import { isLocalFrontend, isTelegramLinkVideo } from "../utils/media";

const BADGE_CLASS =
  "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide";

const ContentStatusBadges = ({ item, type, onPc = false, showPcStatus = false }) => {
  const { isNew } = getContentDateLabels(item);

  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
      {isNew && (
        <span className={`${BADGE_CLASS} bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300`}>
          New
        </span>
      )}
      {item.completed && (
        <span className={`${BADGE_CLASS} bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300`}>
          Watched
        </span>
      )}
      {showPcStatus && type === "video" && onPc && (
        <span className={`${BADGE_CLASS} bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300`}>
          <FiHardDrive size={9} /> On PC
        </span>
      )}
      {showPcStatus && type === "video" && !onPc && (
        <span className={`${BADGE_CLASS} bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400`}>
          Not on PC
        </span>
      )}
    </span>
  );
};

const sortContents = (items, chapterOrder) => {
  return [...items].sort((a, b) => {
    const aSort = a.importSortOrder;
    const bSort = b.importSortOrder;
    if (aSort != null && bSort != null && aSort !== bSort) return aSort - bSort;
    if (aSort != null && bSort == null) return -1;
    if (aSort == null && bSort != null) return 1;

    const aMsg = Number(a.telegramMessageId) || 0;
    const bMsg = Number(b.telegramMessageId) || 0;
    if (aMsg && bMsg && aMsg !== bMsg) return aMsg - bMsg;

    const ca = chapterOrder.get(a.chapterId?._id || a.chapterId) ?? 999;
    const cb = chapterOrder.get(b.chapterId?._id || b.chapterId) ?? 999;
    if (ca !== cb) return ca - cb;
    return String(a.title).localeCompare(String(b.title));
  });
};

const sortByNewestAdded = (items) =>
  [...items].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    if (tb !== ta) return tb - ta;
    return String(a.title).localeCompare(String(b.title));
  });

const LessonList = ({
  items,
  type,
  expandedId,
  onToggle,
  onDeleteContent,
  onRenameContent,
  deletingContentId,
  pcCachedIds = new Set(),
  showPcStatus = false,
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
    <div className="space-y-2">
      {items.map((item, index) => {
        const isOpen = expandedId === item._id;
        const rowType = item.type || type || "video";
        const route = rowType === "video" ? `/video/${item._id}` : `/pdf/${item._id}`;
        const isExternalTelegram = rowType === "video" && isTelegramLinkVideo(item);
        const chapterName = item.chapterId?.chapterName || "General";
        const { posted, added } = getContentDateLabels(item);
        const onPc = pcCachedIds.has(String(item._id));

        return (
          <div
            key={item._id}
            className={`overflow-hidden rounded-xl border bg-white dark:bg-[#1a1a1a] ${
              item.completed
                ? "border-sky-200/90 dark:border-sky-500/20"
                : onPc
                  ? "border-violet-200/90 dark:border-violet-500/20"
                  : "border-slate-200/90 dark:border-white/10"
            }`}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition hover:bg-slate-50 sm:gap-3 sm:px-4 sm:py-3.5 dark:hover:bg-white/[0.03]"
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
                      <span className="truncate">{index + 1}. {item.title}</span>
                      <ContentStatusBadges
                        item={item}
                        type={rowType}
                        onPc={onPc}
                        showPcStatus={showPcStatus}
                      />
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="truncate">{chapterName}</span>
                      {posted && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="shrink-0">Posted {posted}</span>
                        </>
                      )}
                      {added && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className={`shrink-0 ${added !== posted ? "font-medium text-emerald-600 dark:text-emerald-400" : ""}`}>
                            Added {added}
                          </span>
                        </>
                      )}
                    </span>
                  </>
                )}
              </span>
              {onRenameContent && renamingId !== item._id && (
                <button
                  type="button"
                  aria-label={`Rename ${item.title}`}
                  className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                  onClick={(event) => startRename(item, event)}
                >
                  <FiEdit2 size={15} />
                </button>
              )}
              {onDeleteContent && renamingId !== item._id && (
                <button
                  type="button"
                  aria-label={`Delete ${item.title}`}
                  disabled={deletingContentId === item._id}
                  className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
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
              <FiChevronDown
                size={18}
                className={`shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

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
  );
};

const SubjectLessonAccordion = ({
  contents = [],
  chapters = [],
  subjectId = null,
  onDeleteContent,
  onRenameContent,
  deletingContentId = null,
}) => {
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState("new");
  const [pcCachedIds, setPcCachedIds] = useState(new Set());
  const showPcStatus = isLocalFrontend();

  const chapterOrder = useMemo(() => {
    const map = new Map(chapters.map((c, idx) => [c._id, idx]));
    return map;
  }, [chapters]);

  const videos = useMemo(
    () => sortContents(contents.filter((c) => c.type === "video"), chapterOrder),
    [contents, chapterOrder]
  );
  const pdfs = useMemo(
    () => sortContents(contents.filter((c) => c.type === "pdf"), chapterOrder),
    [contents, chapterOrder]
  );
  const newItems = useMemo(
    () => sortByNewestAdded(filterRecentlyAdded(contents, NEW_CONTENT_DAYS)),
    [contents]
  );
  const newVideos = useMemo(() => newItems.filter((c) => c.type === "video"), [newItems]);
  const newPdfs = useMemo(() => newItems.filter((c) => c.type === "pdf"), [newItems]);

  useEffect(() => {
    setActiveTab(newItems.length ? "new" : videos.length ? "videos" : "pdfs");
    setExpandedId(null);
  }, [subjectId, newItems.length, videos.length, pdfs.length]);

  useEffect(() => {
    if (!showPcStatus || !subjectId) {
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
  }, [subjectId, showPcStatus, contents.length]);

  if (!videos.length && !pdfs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-[#1a1a1a]">
        <p className="text-sm text-slate-500 dark:text-slate-400">No lessons in this subject yet.</p>
      </div>
    );
  }

  const tabs = [
    {
      id: "new",
      label: `New (${NEW_CONTENT_DAYS}d)`,
      count: newItems.length,
      icon: FiSparkles,
      accent: "bg-emerald-600",
    },
    { id: "videos", label: "Videos", count: videos.length, icon: FiPlayCircle, accent: "bg-sky-700" },
    { id: "pdfs", label: "PDFs", count: pdfs.length, icon: FiFileText, accent: "bg-amber-600" },
  ];

  const currentTab =
    activeTab === "new" && !newItems.length
      ? videos.length
        ? "videos"
        : "pdfs"
      : activeTab === "videos" && !videos.length
        ? newItems.length
          ? "new"
          : "pdfs"
        : activeTab === "pdfs" && !pdfs.length
          ? newItems.length
            ? "new"
            : "videos"
          : activeTab;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const disabled = tab.count === 0;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={disabled}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${
                currentTab === tab.id
                  ? `${tab.accent} text-white shadow`
                  : disabled
                    ? "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-600"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
              }`}
            >
              <Icon size={14} />
              {tab.label}
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
        {showPcStatus && (
          <span className="ml-auto hidden text-[10px] font-medium uppercase tracking-wider text-slate-400 sm:inline">
            <span className="mr-2 inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-violet-500" /> On PC
            </span>
            <span className="mr-2 inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sky-500" /> Watched
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> New
            </span>
          </span>
        )}
      </div>

      {currentTab === "new" ? (
        <LessonList
          items={newItems}
          expandedId={expandedId}
          onToggle={setExpandedId}
          onDeleteContent={onDeleteContent}
          onRenameContent={onRenameContent}
          deletingContentId={deletingContentId}
          pcCachedIds={pcCachedIds}
          showPcStatus={showPcStatus}
          emptyMessage={`Nothing added in the last ${NEW_CONTENT_DAYS} days. Check the Videos tab for older lessons.`}
        />
      ) : currentTab === "videos" ? (
        <LessonList
          items={videos}
          type="video"
          expandedId={expandedId}
          onToggle={setExpandedId}
          onDeleteContent={onDeleteContent}
          onRenameContent={onRenameContent}
          deletingContentId={deletingContentId}
          pcCachedIds={pcCachedIds}
          showPcStatus={showPcStatus}
        />
      ) : (
        <LessonList
          items={pdfs}
          type="pdf"
          expandedId={expandedId}
          onToggle={setExpandedId}
          onDeleteContent={onDeleteContent}
          onRenameContent={onRenameContent}
          deletingContentId={deletingContentId}
          pcCachedIds={pcCachedIds}
          showPcStatus={false}
        />
      )}
    </div>
  );
};

export default SubjectLessonAccordion;
