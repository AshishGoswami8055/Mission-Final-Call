import { useEffect, useState } from "react";

const programmeIdFrom = (v) => {
  if (!v) return "";
  if (typeof v === "object" && v._id) return String(v._id);
  return String(v);
};

const SubjectModal = ({ initialValue, onClose, onSubmit, defaultProgrammeId, programmes = [] }) => {
  const [name, setName] = useState(initialValue?.name || "");
  const [description, setDescription] = useState(initialValue?.description || "");
  const [programmeId, setProgrammeId] = useState(
    () =>
      programmeIdFrom(initialValue?.programmeId) ||
      programmeIdFrom(defaultProgrammeId) ||
      programmeIdFrom(programmes[0]?._id) ||
      ""
  );

  useEffect(() => {
    setName(initialValue?.name || "");
    setDescription(initialValue?.description || "");
    const pid =
      programmeIdFrom(initialValue?.programmeId) ||
      programmeIdFrom(defaultProgrammeId) ||
      programmeIdFrom(programmes[0]?._id) ||
      "";
    setProgrammeId(pid);
  }, [initialValue, defaultProgrammeId, programmes]);

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3 className="text-lg font-semibold">{initialValue?._id ? "Edit Subject" : "Add Subject"}</h3>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ name, description, programmeId });
          }}
        >
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Coaching batch
            </label>
            <select
              className="input"
              value={programmeId}
              onChange={(e) => setProgrammeId(e.target.value)}
              required
              disabled={!programmes.length}
            >
              {!programmes.length ? <option value="">Add a batch first</option> : null}
              {programmes.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.folderSlug})
                </option>
              ))}
            </select>
          </div>
          <input
            className="input"
            placeholder="Subject name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <textarea
            className="input min-h-24"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!programmeId}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubjectModal;
