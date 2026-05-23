import { useMemo } from "react";
import { FiArrowLeft, FiRefreshCw, FiTrash2, FiUploadCloud } from "react-icons/fi";
import SubjectGridCard from "./SubjectGridCard";
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
  onClearCourse,
  subjectUpdates = {},
  updatesLoading = false,
  updatesAvailable = null,
  onUpdateBatch,
  onUpdateSubject,
  updatingSubjectId = null,
  batchUpdating = false,
}) => {
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
      map[subject._id] = { videos: 0, pdfs: 0, completed: 0 };
    }
    for (const item of contents) {
      const sid = item.subjectId?._id || item.subjectId;
      if (!map[sid]) map[sid] = { videos: 0, pdfs: 0, completed: 0 };
      if (item.type === "video") map[sid].videos += 1;
      if (item.type === "pdf") map[sid].pdfs += 1;
      if (item.completed) map[sid].completed += 1;
    }
    return map;
  }, [subjects, contents]);

  const activeSubject = displaySubjects.find((s) => s._id === activeSubjectId);
  const subjectChapters = chapters.filter((c) => c.subjectId === activeSubjectId);
  const subjectContents = contents.filter(
    (c) => (c.subjectId?._id || c.subjectId) === activeSubjectId
  );

  if (activeSubjectId && activeSubject) {
    return (
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 dark:border-white/10 dark:bg-[#1a1a1a] sm:p-5">
          <button type="button" className="btn-ghost mb-3 text-sm" onClick={onBackToSubjects}>
            <FiArrowLeft size={14} /> Back to subjects
          </button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Home / {batchName} / {activeSubject.name}
              </p>
              <h2 className="font-display mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
                {activeSubject.name}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {subjectContents.filter((c) => c.type === "video").length} videos ·{" "}
                {subjectContents.filter((c) => c.type === "pdf").length} PDFs
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {subjectUpdates[activeSubjectId]?.hasUpdate && onUpdateSubject && (
                <button
                  type="button"
                  className="btn-primary text-sm"
                  disabled={updatingSubjectId === activeSubjectId}
                  onClick={() => onUpdateSubject(activeSubject)}
                >
                  <FiRefreshCw
                    size={14}
                    className={updatingSubjectId === activeSubjectId ? "animate-spin" : ""}
                  />
                  Download new
                  {subjectUpdates[activeSubjectId]?.newCount
                    ? ` (${subjectUpdates[activeSubjectId].newCount} new)`
                    : ""}
                </button>
              )}
              {onDeleteSubject && (
                <button
                  type="button"
                  className="btn-ghost text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  onClick={() => onDeleteSubject(activeSubject)}
                >
                  <FiTrash2 size={14} /> Delete subject
                </button>
              )}
            </div>
          </div>
        </div>
        <SubjectLessonAccordion
          contents={subjectContents}
          chapters={subjectChapters}
          onDeleteContent={onDeleteContent}
          onRenameContent={onRenameContent}
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
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onClearCourse && displaySubjects.length > 0 && (
              <button
                type="button"
                className="btn-ghost text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                onClick={onClearCourse}
              >
                <FiTrash2 size={14} /> Clear course
              </button>
            )}
            {onUpdateBatch && displaySubjects.some((s) => s.telegramTopicId != null) && (
              <button
                type="button"
                className={`text-sm ${updatesAvailable?.subjectsWithUpdates > 0 ? "btn-primary" : "btn-secondary"}`}
                disabled={batchUpdating || updatesLoading}
                onClick={onUpdateBatch}
              >
                <FiRefreshCw
                  size={14}
                  className={batchUpdating || updatesLoading ? "animate-spin" : ""}
                />
                Download new lessons
                {updatesAvailable?.subjectsWithUpdates > 0 && (
                  <span className="ml-1 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                    {updatesAvailable.subjectsWithUpdates}
                  </span>
                )}
              </button>
            )}
            <button type="button" className="btn-secondary text-sm" onClick={onImportTelegram}>
              <FiUploadCloud size={15} /> Add from Telegram
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {displaySubjects.map((subject, index) => (
          <SubjectGridCard
            key={subject._id}
            subject={subject}
            index={index}
            stats={subjectStats[subject._id]}
            updateInfo={subjectUpdates[subject._id]}
            onClick={onSelectSubject}
            onDelete={onDeleteSubject}
            onUpdateSubject={onUpdateSubject}
            updating={updatingSubjectId === subject._id}
          />
        ))}
        {!displaySubjects.length && (
          <div className="card col-span-full p-10 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No subjects yet. Import your Telegram batch to sync forum topics as subjects.
            </p>
            <button type="button" className="btn-primary mt-4 text-sm" onClick={onImportTelegram}>
              <FiUploadCloud size={15} /> Add from Telegram
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default BatchCourseView;
