import { useState } from "react";

const ProgrammeModal = ({ cdsCycleId, onClose, onSubmit }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-md">
        <h3 className="text-lg font-semibold">Add coaching batch</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          e.g. Golf Batch, Arjuna Batch — each gets its own folder under your CDS cycle for videos and PDFs.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ name, description, cdsCycleId });
          }}
        >
          <input
            className="input"
            placeholder="Batch name (e.g. Golf Batch)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <textarea
            className="input min-h-20"
            placeholder="Optional note (coaching / source)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create batch
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProgrammeModal;
