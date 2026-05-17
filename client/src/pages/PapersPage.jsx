import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiFileText, FiPlus, FiUpload } from "react-icons/fi";
import api from "../api/client";
import { SkeletonCard } from "../components/Loader";
import PaperCard from "../components/PaperCard";
import PaperModal from "../components/PaperModal";
import Layout from "../components/Layout";

const parsePreview = (name) => {
  const without = (name || "").replace(/\.pdf$/i, "").trim();
  const match = without.match(/\b(19|20)\d{2}\b/g);
  const year = match ? match[match.length - 1] : "—";
  return { title: without.replace(/[-_]+/g, " ").trim() || without, year };
};

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [
  { value: "", label: "All years" },
  ...Array.from({ length: currentYear - 1999 }, (_, i) => {
    const y = currentYear - i;
    return { value: String(y), label: String(y) };
  }),
];

const CDS_SLOT_OPTIONS = [
  { value: "", label: "All (CDS 1 & 2)" },
  { value: "1", label: "CDS 1" },
  { value: "2", label: "CDS 2" },
];

const PapersPage = () => {
  const [papers, setPapers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [yearFilter, setYearFilter] = useState("");
  const [cdsFilter, setCdsFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPaper, setEditingPaper] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const fetchPapers = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 24, sort: "yearDesc" };
      if (yearFilter) params.year = yearFilter;
      if (cdsFilter) params.cdsSlot = cdsFilter;
      const { data } = await api.get("/papers", { params });
      setPapers(data.items || []);
      setPagination(data.pagination || { page: 1, limit: 24, total: 0, totalPages: 1 });
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to load papers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, [yearFilter, cdsFilter, page]);

  const buildPaperFormData = (payload) => {
    const formData = new FormData();
    formData.append("year", payload.year);
    formData.append("title", payload.title);
    formData.append("examType", payload.examType);
    formData.append("description", payload.description);
    formData.append("sourceType", payload.sourceType);
    if (payload.sourceType === "url") formData.append("url", payload.url || "");
    if (payload.durationMinutes) formData.append("durationMinutes", payload.durationMinutes);
    if (payload.totalQuestions) formData.append("totalQuestions", payload.totalQuestions);
    if (payload.file) formData.append("file", payload.file);
    return formData;
  };

  const handleAddPaper = async (payload) => {
    try {
      const formData = buildPaperFormData(payload);
      const { data } = await api.post("/papers", formData, { headers: { "Content-Type": "multipart/form-data" } });
      if (payload.file && data?.pdfDigitalizeWarning) {
        toast.warning(data.pdfDigitalizeWarning, { autoClose: 8000 });
      } else if (payload.file && data?.pdfDigitalized) {
        toast.success("Paper added. PDF is digitalized and copyable.");
      } else {
        toast.success("Paper added");
      }
      setModalOpen(false);
      setEditingPaper(null);
      fetchPapers();
    } catch (e) {
      toast.error(e.response?.data?.message || "Could not save paper");
    }
  };

  const handleUpdatePaper = async (payload) => {
    if (!editingPaper?._id) return;
    try {
      const formData = buildPaperFormData(payload);
      const { data } = await api.put(`/papers/${editingPaper._id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setModalOpen(false);
      setEditingPaper(null);
      if (payload.file && data?.pdfDigitalizeWarning) {
        toast.warning(data.pdfDigitalizeWarning, { autoClose: 8000 });
      } else if (payload.file && data?.pdfDigitalized) {
        toast.success("Paper updated. PDF is digitalized and copyable.");
      } else {
        toast.success("Paper updated");
      }
      fetchPapers();
    } catch (e) {
      toast.error(e.response?.data?.message || "Could not update paper");
    }
  };

  const handleDeletePaper = async (id) => {
    if (!window.confirm("Delete this paper?")) return;
    try {
      await api.delete(`/papers/${id}`);
      toast.success("Paper deleted");
      fetchPapers();
    } catch (e) {
      toast.error(e.response?.data?.message || "Delete failed");
    }
  };

  const handleToggleAttempted = async (paperId) => {
    try {
      const { data } = await api.post(`/papers/${paperId}/progress`);
      setPapers((prev) =>
        prev.map((p) => (p._id === paperId ? { ...p, attempted: data.attempted } : p))
      );
    } catch (e) {
      toast.error(e.response?.data?.message || "Could not update");
    }
  };

  const openEdit = (paper) => {
    setEditingPaper(paper);
    setModalOpen(true);
  };

  const handleBulkFilesChange = (e) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setBulkFiles(list.filter((f) => f.type === "application/pdf"));
  };

  const handleBulkSubmit = async () => {
    if (bulkFiles.length === 0) {
      toast.error("Select at least one PDF");
      return;
    }
    setBulkSubmitting(true);
    try {
      const formData = new FormData();
      bulkFiles.forEach((f) => formData.append("files", f));
      const { data } = await api.post("/papers/bulk", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const created = data.created ?? 0;
      const failed = data.failed ?? 0;
      if (created > 0) toast.success(`${created} paper${created !== 1 ? "s" : ""} added (year & title from file names).`);
      if (failed > 0) toast.error(`${failed} file${failed !== 1 ? "s" : ""} failed.`);
      setBulkOpen(false);
      setBulkFiles([]);
      fetchPapers();
    } catch (e) {
      toast.error(e.response?.data?.message || "Bulk upload failed");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const attemptedCount = useMemo(() => papers.filter((p) => p.attempted).length, [papers]);

  const headerActions = (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        className="btn-ghost text-sm"
        onClick={() => {
          setBulkFiles([]);
          setBulkOpen(true);
        }}
      >
        <FiUpload size={15} />
        <span className="hidden sm:inline">Bulk upload</span>
      </button>
      <button
        type="button"
        className="btn-primary text-sm"
        onClick={() => {
          setEditingPaper(null);
          setModalOpen(true);
        }}
      >
        <FiPlus size={15} />
        <span className="hidden sm:inline">Add paper</span>
        <span className="sm:hidden">Add</span>
      </button>
    </div>
  );

  return (
    <Layout
      title="Previous Year Papers"
      subtitle="Original CDS · IMA question papers — exam-style attempts and progress tracking."
      actions={headerActions}
      showSearch={false}
    >
      <div className="-mx-4 space-y-3 sm:-mx-6">
        <div className="w-full rounded-xl border border-slate-200/90 bg-white p-3 dark:border-white/10 dark:bg-[#1a1a1a]">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select
              className="input min-h-10 min-w-0 flex-1 py-2! text-sm sm:max-w-44"
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setPage(1);
              }}
            >
              {YEAR_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="input min-h-10 min-w-0 flex-1 py-2! text-sm sm:max-w-48"
              value={cdsFilter}
              onChange={(e) => {
                setCdsFilter(e.target.value);
                setPage(1);
              }}
            >
              {CDS_SLOT_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="h-px w-full bg-slate-100 sm:hidden dark:bg-white/10" />
            <p className="text-sm tabular-nums text-slate-500 sm:ml-auto dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">{pagination.total}</span>
              {" paper"}
              {pagination.total !== 1 ? "s" : ""}
              {attemptedCount > 0 && (
                <>
                  <span className="text-slate-300 dark:text-slate-600"> · </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{attemptedCount}</span> attempted
                </>
              )}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonCard key={idx} tall />
            ))}
          </div>
        ) : papers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center dark:border-white/15 dark:bg-[#1a1a1a]">
            <FiFileText className="mx-auto text-4xl text-slate-300 dark:text-slate-600" strokeWidth={1.25} />
            <p className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">No papers yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Add PDFs or links to build your CDS · IMA previous-year library.
            </p>
            <button
              type="button"
              className="btn-primary mt-6"
              onClick={() => setModalOpen(true)}
            >
              <FiPlus /> Add paper
            </button>
          </div>
        ) : (
          <>
            <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
              {papers.map((paper) => (
                <PaperCard
                  key={paper._id}
                  paper={paper}
                  onToggleAttempted={handleToggleAttempted}
                  onEdit={openEdit}
                  onDelete={handleDeletePaper}
                />
              ))}
            </div>
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  className="btn-secondary min-w-28"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium tabular-nums text-slate-700 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-slate-200">
                  {page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="btn-secondary min-w-28"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <PaperModal
          paper={editingPaper}
          onClose={() => {
            setModalOpen(false);
            setEditingPaper(null);
          }}
          onSubmit={editingPaper ? handleUpdatePaper : handleAddPaper}
        />
      )}

      {bulkOpen && (
        <div className="modal-overlay">
          <div className="modal-card max-w-lg">
            <h3 className="text-lg font-semibold">Bulk upload papers</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Select multiple PDFs. Each file becomes one paper: <strong>year</strong> and <strong>title</strong> are taken from the file name (e.g. &quot;GK CDS 1 2015.pdf&quot; → year 2015, title &quot;GK CDS 1 2015&quot;).
            </p>
            <div className="mt-4">
              <input
                type="file"
                accept="application/pdf"
                multiple
                className="input"
                onChange={handleBulkFilesChange}
              />
            </div>
            {bulkFiles.length > 0 && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-black/20">
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {bulkFiles.length} file{bulkFiles.length !== 1 ? "s" : ""} → will be added as:
                </p>
                <ul className="space-y-1 text-sm">
                  {bulkFiles.map((f, i) => {
                    const { title, year } = parsePreview(f.name);
                    return (
                      <li key={i} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                        <span className="min-w-0 truncate" title={title}>{title}</span>
                        <span className="shrink-0 text-slate-500">Year {year}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => { setBulkOpen(false); setBulkFiles([]); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={handleBulkSubmit}
                disabled={bulkFiles.length === 0 || bulkSubmitting}
              >
                {bulkSubmitting ? "Uploading…" : `Add ${bulkFiles.length} paper${bulkFiles.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default PapersPage;
