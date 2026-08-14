import { useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiEdit2,
  FiGrid,
  FiList,
  FiLoader,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiUploadCloud,
} from "react-icons/fi";
import SubjectGridCard from "./SubjectGridCard";
import SubjectListRow from "./SubjectListRow";
import SubjectLessonAccordion from "./SubjectLessonAccordion";
import SubjectPlayAllPremium from "./SubjectPlayAllPremium";
import { formatTotalStudyDuration, sumVideoDurationSeconds } from "../utils/media";

const BatchCourseView = ({
  batchName,
  cycleTitle,
  subjects,
  chapters,
  contents,
  activeSubjectId,
  onSelectSubject,
  onBackToSubjects,
  onImportTelegram,
  onDeleteSubject,
  onDeleteContent,
  onRenameContent,
  onReorderContent,
  reorderingContentId = null,
  onRenameSubject,
  onToggleCompleted,
  togglingCompletedId = null,
  onToggleSubjectCompleted,
  togglingSubjectComplete = false,
  onClearCourse,
  subjectUpdates = {},
  subjectStats: subjectStatsProp = null,
  loadingSubjectContents = false,
  updatesLoading = false,
  updatesAvailable = null,
  onUpdateBatch,
  onCheckForUpdates,
  onUpdateSubject,
  updatingSubjectId = null,
  batchUpdating = false,
  checkingUpdates = false,
  renamingSubjectId = null,
  deletingSubjectId = null,
  deletingContentId = null,
  clearingCourse = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [filterTab, setFilterTab] = useState("all");
  const [editingSubjectName, setEditingSubjectName] = useState(false);
  const [subjectRenameValue, setSubjectRenameValue] = useState("");

  const sortedSubjects = useMemo(() => {
    return [...subjects].sort((a, b) => {
      const aTg = a.telegramTopicId != null ? 0 : 1;
      const bTg = b.telegramTopicId != null ? 0 : 1;
      if (aTg !== bTg) return aTg - bTg;
      return a.name.localeCompare(b.name);
    });
  }, [subjects]);

  const displaySubjects = useMemo(() => {
    const telegramSubjects = sortedSubjects.filter((s) => s.telegramTopicId != null);
    return telegramSubjects.length > 0 ? telegramSubjects : sortedSubjects;
  }, [sortedSubjects]);

  const subjectStats = useMemo(() => {
    if (subjectStatsProp) return subjectStatsProp;
    const map = {};
    for (const subject of subjects) {
      map[String(subject._id)] = { videos: 0, pdfs: 0, completed: 0 };
    }
    for (const item of contents) {
      const sid = String(item.subjectId?._id || item.subjectId || "");
      if (!sid) continue;
      if (!map[sid]) map[sid] = { videos: 0, pdfs: 0, completed: 0 };
      if (item.type === "video") map[sid].videos += 1;
      if (item.type === "pdf") map[sid].pdfs += 1;
      if (item.completed) map[sid].completed += 1;
    }
    return map;
  }, [subjects, contents, subjectStatsProp]);

  const batchSummary = useMemo(() => {
    let totalLessons = 0;
    let completedLessons = 0;
    let subjectsWithUpdates = 0;
    for (const subject of displaySubjects) {
      const stats = subjectStats[String(subject._id)] || {};
      const total = (stats.videos || 0) + (stats.pdfs || 0);
      totalLessons += total;
      completedLessons += stats.completed || 0;
      if (subjectUpdates[String(subject._id)]?.hasUpdate) subjectsWithUpdates += 1;
    }
    const completionPct = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return { totalLessons, completedLessons, completionPct, subjectsWithUpdates };
  }, [displaySubjects, subjectStats, subjectUpdates]);

  const filteredSubjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return displaySubjects.filter((subject) => {
      const stats = subjectStats[String(subject._id)] || {};
      const total = (stats.videos || 0) + (stats.pdfs || 0);
      const completed = stats.completed || 0;
      const completionPct = total ? Math.round((completed / total) * 100) : 0;
      const update = subjectUpdates[String(subject._id)];

      if (q && !subject.name.toLowerCase().includes(q)) return false;
      if (filterTab === "updates" && !update?.hasUpdate) return false;
      if (filterTab === "incomplete" && (total === 0 || completionPct === 100)) return false;
      return true;
    });
  }, [displaySubjects, subjectStats, subjectUpdates, searchQuery, filterTab]);

  const hasTelegramSubjects = displaySubjects.some((s) => s.telegramTopicId != null);

  const activeSubject = displaySubjects.find((s) => String(s._id) === String(activeSubjectId));
  const subjectChapters = chapters.filter(
    (c) => String(c.subjectId) === String(activeSubjectId)
  );
  const subjectContents = contents.filter(
    (c) => String(c.subjectId?._id || c.subjectId) === String(activeSubjectId)
  );

  const subjectWatchTime = useMemo(() => {
    const videos = subjectContents.filter((item) => item.type === "video");
    const totalSeconds = sumVideoDurationSeconds(videos);
    const timedCount = videos.filter((item) => Number(item.duration) > 0).length;
    return {
      videoCount: videos.length,
      pdfCount: subjectContents.filter((item) => item.type === "pdf").length,
      totalSeconds,
      timedCount,
      label: formatTotalStudyDuration(totalSeconds),
    };
  }, [subjectContents]);

  const subjectDetailBusy =
    updatingSubjectId === activeSubjectId ||
    renamingSubjectId === activeSubjectId ||
    deletingSubjectId === activeSubjectId;

  const startSubjectDetailRename = () => {
    setEditingSubjectName(true);
    setSubjectRenameValue(activeSubject?.name || "");
  };

  const cancelSubjectDetailRename = () => {
    setEditingSubjectName(false);
    setSubjectRenameValue("");
  };

  const saveSubjectDetailRename = async () => {
    const nextName = subjectRenameValue.trim();
    if (!nextName || nextName === activeSubject?.name) {
      cancelSubjectDetailRename();
      return;
    }
    if (!onRenameSubject || !activeSubject) return;
    try {
      await onRenameSubject(activeSubject, nextName);
      cancelSubjectDetailRename();
    } catch {
      /* parent shows toast */
    }
  };

  if (activeSubjectId && activeSubject) {
    return (
      <section className="space-y-3 md:space-y-4">
        <div className="mobile-course-header sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 backdrop-blur-md dark:border-white/10 dark:bg-[#0a0a0a]/95 md:static md:rounded-2xl md:border md:p-4 md:backdrop-blur-none sm:md:p-5">
          <button type="button" className="btn-ghost -ml-1 mb-1 px-2! py-1.5! text-sm md:mb-3" onClick={onBackToSubjects}>
            <FiArrowLeft size={16} /> Back
          </button>
          <div className="flex items-start justify-between gap-2 md:flex-wrap md:gap-3">
            <div className="min-w-0 flex-1">
              <p className="hidden text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 md:block">
                Home / {batchName} / {activeSubject.name}
              </p>
              {editingSubjectName ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="input min-w-0 flex-1 py-2 text-lg font-bold"
                    value={subjectRenameValue}
                    onChange={(event) => setSubjectRenameValue(event.target.value)}
                    autoFocus
                    disabled={renamingSubjectId === activeSubjectId}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveSubjectDetailRename();
                      if (event.key === "Escape") cancelSubjectDetailRename();
                    }}
                  />
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={renamingSubjectId === activeSubjectId || !subjectRenameValue.trim()}
                    onClick={saveSubjectDetailRename}
                  >
                    {renamingSubjectId === activeSubjectId ? (
                      <FiLoader size={14} className="animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    disabled={renamingSubjectId === activeSubjectId}
                    onClick={cancelSubjectDetailRename}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-0.5 flex flex-wrap items-center gap-2 md:mt-1">
                  <h2 className="font-display text-lg font-bold leading-tight text-slate-900 dark:text-slate-50 md:text-2xl sm:md:text-3xl">
                    {activeSubject.name}
                  </h2>
                  {onRenameSubject && (
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1.5 text-sm"
                      disabled={subjectDetailBusy}
                      title="Rename subject"
                      onClick={startSubjectDetailRename}
                    >
                      {renamingSubjectId === activeSubjectId ? (
                        <FiLoader size={14} className="animate-spin" />
                      ) : (
                        <FiEdit2 size={14} />
                      )}
                    </button>
                  )}
                </div>
              )}
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 md:mt-1 md:text-sm">
                {subjectWatchTime.videoCount} videos · {subjectWatchTime.pdfCount} PDFs
                {subjectWatchTime.label ? (
                  <>
                    {" · "}
                    <span
                      className="font-semibold text-slate-700 dark:text-slate-200"
                      title={
                        subjectWatchTime.timedCount < subjectWatchTime.videoCount
                          ? `Duration known for ${subjectWatchTime.timedCount} of ${subjectWatchTime.videoCount} videos`
                          : "Total watch time for this subject"
                      }
                    >
                      {subjectWatchTime.label} watch time
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="hidden shrink-0 flex-wrap gap-2 md:flex">
              {activeSubject.telegramTopicId != null && onUpdateSubject && (
                <button
                  type="button"
                  className={
                    subjectUpdates[String(activeSubjectId)]?.hasUpdate
                      ? "btn-primary text-sm"
                      : "btn-secondary text-sm"
                  }
                  disabled={subjectDetailBusy}
                  onClick={() => onUpdateSubject(activeSubject)}
                >
                  {updatingSubjectId === activeSubjectId ? (
                    <FiLoader size={14} className="animate-spin" />
                  ) : (
                    <FiRefreshCw size={14} />
                  )}
                  Update subject
                  {subjectUpdates[String(activeSubjectId)]?.newCount
                    ? ` (${subjectUpdates[String(activeSubjectId)].newCount} new)`
                    : ""}
                </button>
              )}
              {onDeleteSubject && (
                <button
                  type="button"
                  className="btn-ghost text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  disabled={subjectDetailBusy}
                  onClick={() => onDeleteSubject(activeSubject)}
                >
                  {deletingSubjectId === activeSubjectId ? (
                    <FiLoader size={14} className="animate-spin" />
                  ) : (
                    <FiTrash2 size={14} />
                  )}{" "}
                  Delete subject
                </button>
              )}
            </div>
          </div>
        </div>
          {loadingSubjectContents ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <FiLoader className="animate-spin" /> Loading lessons…
            </div>
          ) : (
            <>
              <SubjectPlayAllPremium
                subject={activeSubject}
                contents={subjectContents}
                chapters={subjectChapters}
                disabled={subjectDetailBusy || loadingSubjectContents}
                onToggleSubjectCompleted={onToggleSubjectCompleted}
                togglingSubjectComplete={togglingSubjectComplete}
              />
              <SubjectLessonAccordion
              contents={subjectContents}
              chapters={subjectChapters}
              subjectId={activeSubjectId}
              onDeleteContent={onDeleteContent}
              onRenameContent={onRenameContent}
              onReorderContent={onReorderContent}
              reorderingContentId={reorderingContentId}
              deletingContentId={deletingContentId}
              onToggleCompleted={onToggleCompleted}
              togglingCompletedId={togglingCompletedId}
            />
            </>
          )}
      </section>
    );
  }

  return (
    <section className="space-y-3 md:space-y-4">
      <div className="hidden rounded-2xl border border-slate-200/90 bg-white p-4 dark:border-white/10 dark:bg-[#1a1a1a] md:block sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Home / Course Details
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase text-slate-900 dark:text-slate-50 sm:text-3xl">
              {batchName}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {cycleTitle} · {displaySubjects.length} subjects
              {batchSummary.totalLessons > 0 && (
                <>
                  {" "}
                  · {batchSummary.completionPct}% complete ({batchSummary.completedLessons}/
                  {batchSummary.totalLessons})
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onClearCourse && displaySubjects.length > 0 && (
              <button
                type="button"
                className="btn-ghost text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                disabled={clearingCourse || batchUpdating}
                onClick={onClearCourse}
              >
                {clearingCourse ? (
                  <FiLoader size={14} className="animate-spin" />
                ) : (
                  <FiTrash2 size={14} />
                )}{" "}
                Clear course
              </button>
            )}
            {onCheckForUpdates && hasTelegramSubjects && (
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={checkingUpdates || batchUpdating || updatesLoading || clearingCourse}
                onClick={onCheckForUpdates}
                title="Scan Telegram and show whether new lessons are available"
              >
                {checkingUpdates || updatesLoading ? (
                  <FiLoader size={14} className="animate-spin" />
                ) : (
                  <FiSearch size={14} />
                )}
                Check for updates
              </button>
            )}
            {onUpdateBatch && hasTelegramSubjects && (
              <button
                type="button"
                className={`text-sm ${
                  batchSummary.subjectsWithUpdates > 0 || updatesAvailable?.subjectsWithUpdates > 0
                    ? "btn-primary"
                    : "btn-secondary"
                }`}
                disabled={batchUpdating || checkingUpdates || updatesLoading || clearingCourse}
                onClick={onUpdateBatch}
                title="Download new lessons for all subjects from Telegram"
              >
                {batchUpdating ? (
                  <FiLoader size={14} className="animate-spin" />
                ) : (
                  <FiRefreshCw size={14} />
                )}
                Update all subjects
                <span className="hidden sm:inline"> from Telegram</span>
                {(updatesAvailable?.subjectsWithUpdates || batchSummary.subjectsWithUpdates) > 0 && (
                  <span className="ml-1 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                    {updatesAvailable?.subjectsWithUpdates || batchSummary.subjectsWithUpdates}
                  </span>
                )}
              </button>
            )}
            <button type="button" className="btn-secondary text-sm" onClick={onImportTelegram}>
              <FiUploadCloud size={15} /> Add from Telegram
            </button>
          </div>
        </div>

        {displaySubjects.length > 0 && batchSummary.totalLessons > 0 && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
              <span>Batch completion</span>
              <span>{batchSummary.completionPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-linear-to-r from-teal-500 to-emerald-500 transition-all"
                style={{ width: `${batchSummary.completionPct}%` }}
              />
            </div>
          </div>
        )}

        {hasTelegramSubjects && updatesAvailable?.available && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {updatesAvailable.subjectsWithUpdates > 0 ? (
              <span className="font-medium text-teal-700 dark:text-teal-400">
                {updatesAvailable.subjectsWithUpdates} subject
                {updatesAvailable.subjectsWithUpdates === 1 ? "" : "s"} have updates (
                {updatesAvailable.totalNew || 0} new lesson
                {(updatesAvailable.totalNew || 0) === 1 ? "" : "s"}) — use{" "}
                <span className="font-semibold">Update all subjects</span> to import.
              </span>
            ) : (
              <span>Last check: all Telegram subjects are up to date.</span>
            )}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 md:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{batchName}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {displaySubjects.length} subjects · {batchSummary.completionPct}% complete
          </p>
        </div>
        {onUpdateBatch && hasTelegramSubjects && (
          <button
            type="button"
            className="btn-secondary shrink-0 px-3! py-2! text-xs"
            disabled={batchUpdating || checkingUpdates || updatesLoading}
            onClick={onUpdateBatch}
          >
            {batchUpdating ? <FiLoader size={14} className="animate-spin" /> : <FiRefreshCw size={14} />}
            Sync
          </button>
        )}
      </div>

      {displaySubjects.length > 0 && batchSummary.totalLessons > 0 && (
        <div className="md:hidden">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-teal-600 transition-all"
              style={{ width: `${batchSummary.completionPct}%` }}
            />
          </div>
        </div>
      )}

      {displaySubjects.length > 0 && (
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 dark:border-white/10 dark:bg-[#1a1a1a] md:rounded-2xl md:p-4">
          <div className="relative min-w-0">
            <FiSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subjects…"
              className="input w-full pl-10 text-sm"
            />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto md:mt-3 md:flex-wrap md:items-center md:gap-2">
            {[
              { id: "all", label: "All" },
              { id: "updates", label: "Updates" },
              { id: "incomplete", label: "In progress" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filterTab === tab.id
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                }`}
                onClick={() => setFilterTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            <div className="ml-auto hidden rounded-lg border border-slate-200 p-0.5 dark:border-white/10 md:flex">
                <button
                  type="button"
                  className={`rounded-md p-2 transition ${
                    viewMode === "list"
                      ? "bg-teal-600 text-white"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                  }`}
                  onClick={() => setViewMode("list")}
                  title="List view"
                >
                  <FiList size={16} />
                </button>
                <button
                  type="button"
                  className={`rounded-md p-2 transition ${
                    viewMode === "grid"
                      ? "bg-teal-600 text-white"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                  }`}
                  onClick={() => setViewMode("grid")}
                  title="Grid view"
                >
                  <FiGrid size={16} />
                </button>
              </div>
            </div>
          <p className="mt-2 hidden text-xs text-slate-500 dark:text-slate-400 md:block">
            Showing {filteredSubjects.length} of {displaySubjects.length} subjects
            {searchQuery.trim() ? ` matching “${searchQuery.trim()}”` : ""}
          </p>
        </div>
      )}

      {viewMode === "list" ? (
        <div className="space-y-2">
          {filteredSubjects.map((subject, index) => (
            <SubjectListRow
              key={subject._id}
              subject={subject}
              index={index}
              stats={subjectStats[String(subject._id)]}
              updateInfo={subjectUpdates[String(subject._id)]}
              onClick={onSelectSubject}
              onUpdateSubject={onUpdateSubject}
              onRenameSubject={onRenameSubject}
              onDeleteSubject={onDeleteSubject}
              updating={updatingSubjectId === subject._id}
              renaming={renamingSubjectId === subject._id}
              deleting={deletingSubjectId === subject._id}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredSubjects.map((subject, index) => (
            <SubjectGridCard
              key={subject._id}
              subject={subject}
              index={index}
              stats={subjectStats[String(subject._id)]}
              updateInfo={subjectUpdates[String(subject._id)]}
              onClick={onSelectSubject}
              onDelete={onDeleteSubject}
              onRenameSubject={onRenameSubject}
              onUpdateSubject={onUpdateSubject}
              renaming={renamingSubjectId === subject._id}
              deleting={deletingSubjectId === subject._id}
              compact
            />
          ))}
        </div>
      )}

      {!displaySubjects.length && (
        <div className="card p-10 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No subjects yet. Import your Telegram batch to sync forum topics as subjects.
          </p>
          <button type="button" className="btn-primary mt-4 text-sm" onClick={onImportTelegram}>
            <FiUploadCloud size={15} /> Add from Telegram
          </button>
        </div>
      )}

      {displaySubjects.length > 0 && !filteredSubjects.length && (
        <div className="card p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">No subjects match your search or filter.</p>
          <button
            type="button"
            className="btn-ghost mt-3 text-sm"
            onClick={() => {
              setSearchQuery("");
              setFilterTab("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
};

export default BatchCourseView;
