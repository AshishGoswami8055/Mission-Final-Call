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
  onRenameSubject,
  onClearCourse,
  subjectUpdates = {},
  updatesLoading = false,
  updatesAvailable = null,
  onUpdateBatch,
  onUpdateSubject,
  updatingSubjectId = null,
  batchUpdating = false,
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
  }, [subjects, contents]);

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
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 dark:border-white/10 dark:bg-[#1a1a1a] sm:p-5">
          <button type="button" className="btn-ghost mb-3 text-sm" onClick={onBackToSubjects}>
            <FiArrowLeft size={14} /> Back to subjects
          </button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
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
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {subjectContents.filter((c) => c.type === "video").length} videos ·{" "}
                {subjectContents.filter((c) => c.type === "pdf").length} PDFs
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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
        <SubjectLessonAccordion
          contents={subjectContents}
          chapters={subjectChapters}
          subjectId={activeSubjectId}
          onDeleteContent={onDeleteContent}
          onRenameContent={onRenameContent}
          deletingContentId={deletingContentId}
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 dark:border-white/10 dark:bg-[#1a1a1a] sm:p-5">
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
            {onUpdateBatch && hasTelegramSubjects && (
              <button
                type="button"
                className={`text-sm ${
                  batchSummary.subjectsWithUpdates > 0 || updatesAvailable?.subjectsWithUpdates > 0
                    ? "btn-primary"
                    : "btn-secondary"
                }`}
                disabled={batchUpdating || updatesLoading || clearingCourse}
                onClick={onUpdateBatch}
                title="Download new lessons for all subjects from Telegram"
              >
                {batchUpdating || updatesLoading ? (
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
      </div>

      {displaySubjects.length > 0 && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3 dark:border-white/10 dark:bg-[#1a1a1a] sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
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
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "all", label: "All" },
                { id: "updates", label: "Has updates" },
                { id: "incomplete", label: "In progress" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    filterTab === tab.id
                      ? "bg-teal-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15"
                  }`}
                  onClick={() => setFilterTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-white/10">
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
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
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
