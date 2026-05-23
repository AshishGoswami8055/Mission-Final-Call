import { useMemo, useState } from "react";
import { FiChevronDown, FiEdit2, FiFileText, FiPlayCircle, FiTrash2, FiVideo } from "react-icons/fi";
import { Link } from "react-router-dom";
import { isTelegramLinkVideo } from "../utils/media";

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

const LessonList = ({ items, type, expandedId, onToggle, onDeleteContent, onRenameContent }) => {
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
        No {type === "video" ? "videos" : "PDFs"} in this subject yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const isOpen = expandedId === item._id;
        const route = item.type === "video" ? `/video/${item._id}` : `/pdf/${item._id}`;
        const isExternalTelegram = item.type === "video" && isTelegramLinkVideo(item);
        const chapterName = item.chapterId?.chapterName || "General";

        return (
          <div
            key={item._id}
            className="overflow-hidden rounded-xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-[#1a1a1a]"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition hover:bg-slate-50 sm:gap-3 sm:px-4 sm:py-3.5 dark:hover:bg-white/[0.03]"
              onClick={() => onToggle(isOpen ? null : item._id)}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  type === "video"
                    ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                }`}
              >
                {type === "video" ? <FiPlayCircle size={16} /> : <FiFileText size={16} />}
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
                      Save
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
                    <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {index + 1}. {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                      {chapterName}
                      {item.completed ? " · Completed" : ""}
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
                  className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteContent(item);
                  }}
                >
                  <FiTrash2 size={15} />
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
                    {type === "video" ? <FiPlayCircle size={15} /> : <FiFileText size={15} />}
                    {type === "video" ? "Watch Class" : "Open PDF"}
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

const SubjectLessonAccordion = ({ contents = [], chapters = [], onDeleteContent, onRenameContent }) => {
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState("videos");

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

  if (!videos.length && !pdfs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-[#1a1a1a]">
        <p className="text-sm text-slate-500 dark:text-slate-400">No lessons in this subject yet.</p>
      </div>
    );
  }

  const tabs = [
    { id: "videos", label: "Videos", count: videos.length, icon: FiPlayCircle },
    { id: "pdfs", label: "PDFs", count: pdfs.length, icon: FiFileText },
  ];

  const defaultTab = videos.length ? "videos" : "pdfs";
  const currentTab = activeTab === "videos" && !videos.length ? "pdfs" : activeTab === "pdfs" && !pdfs.length ? "videos" : activeTab || defaultTab;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
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
                  ? tab.id === "videos"
                    ? "bg-sky-700 text-white shadow"
                    : "bg-amber-600 text-white shadow"
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
      </div>

      {currentTab === "videos" ? (
        <LessonList
          items={videos}
          type="video"
          expandedId={expandedId}
          onToggle={setExpandedId}
          onDeleteContent={onDeleteContent}
          onRenameContent={onRenameContent}
        />
      ) : (
        <LessonList
          items={pdfs}
          type="pdf"
          expandedId={expandedId}
          onToggle={setExpandedId}
          onDeleteContent={onDeleteContent}
          onRenameContent={onRenameContent}
        />
      )}
    </div>
  );
};

export default SubjectLessonAccordion;
