import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowLeft, FiCheckCircle, FiLoader, FiZap } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import Loader from "../components/Loader";
import useWorkspaceCapabilities from "../hooks/useWorkspaceCapabilities";
import { toAbsoluteMediaUrl } from "../utils/media";

const PaperViewerPage = () => {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const { paperExtract } = useWorkspaceCapabilities();

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

  useEffect(() => {
    if (!id || !paperExtract) return;
    const loadAnalysis = async () => {
      try {
        const { data } = await api.get(`/papers/${id}/analysis`);
        setAnalysis(data);
      } catch {
        setAnalysis(null);
      }
    };
    void loadAnalysis();
  }, [id, paperExtract]);

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

  const handleExtract = async () => {
    if (!id || extracting) return;
    setExtracting(true);
    try {
      const { data } = await api.post(`/papers/${id}/extract`);
      setAnalysis({ status: data.status, questions: data.questions || [] });
      toast.success(`Extracted ${data.count || data.questions?.length || 0} questions`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Extraction failed");
    } finally {
      setExtracting(false);
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
    <div className="page-viewer bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <Link to="/papers" className="btn-secondary inline-flex w-fit text-sm">
            <FiArrowLeft /> Back to Papers
          </Link>
          <div className="flex flex-wrap gap-2">
            {paperExtract ? (
              <button
                type="button"
                className="btn-secondary inline-flex text-sm"
                onClick={() => void handleExtract()}
                disabled={extracting}
              >
                {extracting ? <FiLoader className="animate-spin" size={16} /> : <FiZap size={16} />}
                {extracting ? "Extracting…" : "Extract questions (AI)"}
              </button>
            ) : null}
            <button
              type="button"
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition sm:w-auto ${
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
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
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
              <span className="text-sm text-slate-500">{item.durationMinutes} min</span>
            )}
          </div>
          <h1 className="text-lg font-semibold sm:text-xl">{item.title}</h1>
          {item.description ? <p className="mt-1 text-sm text-slate-500">{item.description}</p> : null}
        </div>

        {paperExtract && analysis?.questions?.length ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold">
              Extracted questions ({analysis.questions.length})
            </h2>
            <ol className="mt-3 max-h-72 space-y-3 overflow-y-auto text-sm">
              {analysis.questions.map((q, index) => (
                <li key={`${q.number}-${index}`} className="border-b border-slate-100 pb-2 dark:border-slate-800">
                  <p className="font-medium">
                    Q{q.number}. {q.text}
                  </p>
                  {q.options?.length ? (
                    <ul className="mt-1 list-inside list-disc text-slate-600 dark:text-slate-400">
                      {q.options.map((opt, i) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <iframe title={item.title} src={src} className="h-[75vh] w-full" />
        </div>
      </div>
    </div>
  );
};

export default PaperViewerPage;
