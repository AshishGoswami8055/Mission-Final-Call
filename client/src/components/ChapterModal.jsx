import { useMemo, useState } from "react";

const ChapterModal = ({ subjects, initialValue, onClose, onSubmit }) => {
  const [chapterName, setChapterName] = useState(initialValue?.chapterName || "");
  const [subjectId, setSubjectId] = useState(
    initialValue?.subjectId || subjects[0]?._id || ""
  );

  const disabled = useMemo(() => !subjects.length, [subjects.length]);

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3 className="text-lg font-semibold">{initialValue ? "Edit Chapter" : "Add Chapter"}</h3>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ chapterName, subjectId });
          }}
        >
          <select
            className="input"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={disabled}
            required
          >
            {subjects.map((subject) => (
              <option key={subject._id} value={subject._id}>
                {subject.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Chapter name"
            value={chapterName}
            onChange={(e) => setChapterName(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={disabled}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChapterModal;
