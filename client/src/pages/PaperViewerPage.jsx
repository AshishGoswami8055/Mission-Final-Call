import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowLeft, FiCheckCircle } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import Loader from "../components/Loader";
import { toAbsoluteMediaUrl } from "../utils/media";

const PaperViewerPage = () => {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    const fetchPaper = async () => {
      try {
        const { data } = await api.get(`/papers/${id}`);
        setItem(data);
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not load paper");
      }
    };
    fetchPaper();
  }, [id]);

  const handleToggleAttempted = async () => {
    if (!item || toggling) return;
    setToggling(true);
    try {
      const { data } = await api.post(`/papers/${id}/progress`);
      setItem((prev) => (prev ? { ...prev, attempted: data.attempted } : null));
      toast.success(data.attempted ? "Marked as attempted" : "Unmarked");
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to update");
    } finally {
      setToggling(false);
    }
  };

  if (!item) return <Loader fullPage label="Opening paper…" />;

  const src =
    item.sourceType === "upload"
      ? toAbsoluteMediaUrl(item.filePath)
      : item.sourceType === "cloudinary"
        ? item.pdfUrl || ""
        : item.url || "";

  return (
    <div className="min-h-screen bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/papers" className="btn-secondary inline-flex">
            <FiArrowLeft /> Back to Papers
          </Link>
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
              item.attempted
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "btn-secondary"
            }`}
            onClick={handleToggleAttempted}
            disabled={toggling}
          >
            <FiCheckCircle size={18} />
            {item.attempted ? "Attempted" : "Mark as attempted"}
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              {item.year}
            </span>
            {item.examType && (
              <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {item.examType}
              </span>
            )}
            {item.durationMinutes && (
              <span className="text-sm text-slate-500">
                {item.durationMinutes} min
                {item.totalQuestions ? ` • ${item.totalQuestions} questions` : ""}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          {item.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
          )}
          <iframe
            title={item.title}
            src={src}
            className="mt-4 h-[75vh] w-full rounded-lg border border-slate-300 dark:border-slate-700"
          />
        </div>
      </div>
    </div>
  );
};

export default PaperViewerPage;
