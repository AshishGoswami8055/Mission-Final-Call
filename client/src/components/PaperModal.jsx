import { useEffect, useState } from "react";

const PaperModal = ({ paper, onClose, onSubmit }) => {
  const isEdit = Boolean(paper?._id);
  const [year, setYear] = useState(paper?.year ?? new Date().getFullYear());
  const [title, setTitle] = useState(paper?.title ?? "");
  const [examType, setExamType] = useState(paper?.examType ?? "CDS");
  const [description, setDescription] = useState(paper?.description ?? "");
  const [sourceType, setSourceType] = useState(
    paper?.sourceType === "url" ? "url" : "upload"
  );
  const [url, setUrl] = useState(paper?.url ?? "");
  const [file, setFile] = useState(null);
  const [durationMinutes, setDurationMinutes] = useState(paper?.durationMinutes ?? "");
  const [totalQuestions, setTotalQuestions] = useState(paper?.totalQuestions ?? "");

  useEffect(() => {
    if (paper) {
      setYear(paper.year);
      setTitle(paper.title);
      setExamType(paper.examType ?? "CDS");
      setDescription(paper.description ?? "");
      setSourceType(paper.sourceType === "url" ? "url" : "upload");
      setUrl(paper.url ?? "");
      setDurationMinutes(paper.durationMinutes ?? "");
      setTotalQuestions(paper.totalQuestions ?? "");
    }
  }, [paper]);

  const titleFromFile = (f) => {
    if (!f?.name) return "";
    const nameWithoutExt = f.name.replace(/\.pdf$/i, "").trim();
    return nameWithoutExt.replace(/[-_]+/g, " ").trim() || nameWithoutExt;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const resolvedTitle =
      sourceType === "upload" && file ? titleFromFile(file) : title.trim();
    const effectiveSourceType =
      isEdit && !file && (paper?.sourceType === "cloudinary" || paper?.sourceType === "upload")
        ? paper.sourceType
        : sourceType;
    onSubmit({
      year: Number(year),
      title: resolvedTitle,
      examType: examType.trim() || "CDS",
      description: description.trim(),
      sourceType: effectiveSourceType,
      url: sourceType === "url" ? url.trim() : undefined,
      file: sourceType === "upload" ? file : undefined,
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      totalQuestions: totalQuestions ? Number(totalQuestions) : null,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-md">
        <h3 className="text-lg font-semibold">{isEdit ? "Edit Paper" : "Add Previous Year Paper"}</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upload a PDF (stored on Cloudinary papers account) or link an external PDF URL.
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Year
            </label>
            <input
              className="input"
              type="number"
              min="1990"
              max="2100"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
            />
          </div>
          {(sourceType === "url" || isEdit) && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Title
              </label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. CDS I 2023 – General Knowledge"
                required={sourceType === "url"}
              />
            </div>
          )}
          {sourceType === "upload" && !isEdit && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Title will be taken from the PDF file name.
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Exam type
            </label>
            <input
              className="input"
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              placeholder="e.g. CDS I, CDS II"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Description (optional)
            </label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note about this paper"
            />
          </div>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={sourceType === "upload"}
                onChange={() => setSourceType("upload")}
              />
              Upload PDF
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={sourceType === "url"}
                onChange={() => setSourceType("url")}
              />
              PDF URL
            </label>
          </div>
          {sourceType === "upload" && (
            <div>
              <input
                className="input"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required={!isEdit}
              />
              {isEdit && (paper?.filePath || paper?.sourceType === "cloudinary") && (
                <p className="mt-1 text-xs text-slate-500">
                  {paper?.sourceType === "cloudinary"
                    ? "Current file is on Cloudinary. Choose a new PDF to replace."
                    : "Current file is uploaded. Choose a new file to replace."}
                </p>
              )}
            </div>
          )}
          {sourceType === "url" && (
            <div>
              <input
                className="input"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                required={!isEdit}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Duration (min)
              </label>
              <input
                className="input"
                type="number"
                min="1"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="120"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Total questions
              </label>
              <input
                className="input"
                type="number"
                min="1"
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(e.target.value)}
                placeholder="100"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              {isEdit ? "Update" : "Add Paper"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaperModal;
