import { useEffect, useState } from "react";
import { FiArrowLeft, FiDownload } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import { downloadDataUrl, loadScreenshotNotes } from "../utils/screenshotNotes";

const formatTime = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const ScreenshotViewerPage = () => {
  const { id, noteId } = useParams();
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const notes = await loadScreenshotNotes(id);
      if (!mounted) return;
      setNote(notes.find((item) => item.id === noteId) || null);
      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [id, noteId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Loading screenshot...</p>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Screenshot not found</p>
          <Link to={`/video/${id}`} className="btn-primary mt-4 inline-flex">
            <FiArrowLeft /> Back to Video
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={`/video/${id}`} className="btn-secondary inline-flex">
            <FiArrowLeft /> Back to Video
          </Link>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              downloadDataUrl(
                note.imageData,
                `${String(note.title || `screenshot_${formatTime(note.time)}`).replace(/[^a-z0-9-_]/gi, "_")}.png`
              )
            }
          >
            <FiDownload />
            Download
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-2 text-base font-semibold text-slate-800 dark:text-slate-100">
            {note.title || `Note ${formatTime(note.time)}`}
          </p>
          <p className="mb-3 text-sm text-slate-500">
            Captured at <span className="font-semibold text-blue-600 dark:text-blue-400">{formatTime(note.time)}</span>
          </p>
          <img
            src={note.imageData}
            alt={`Screenshot at ${formatTime(note.time)}`}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700"
          />
        </div>
      </div>
    </div>
  );
};

export default ScreenshotViewerPage;
