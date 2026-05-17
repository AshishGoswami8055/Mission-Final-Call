import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  FiBookOpen,
  FiCheckCircle,
  FiClock,
  FiEdit2,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiUpload,
  FiX,
} from "react-icons/fi";
import api from "../api/client";
import Layout from "./Layout";
import Loader from "./Loader";

const emptyForm = {
  word: "",
  meaning: "",
  example: "",
  synonyms: "",
  tags: "",
  level: "new",
};

const formatDate = (value) => {
  if (!value) return "Not scheduled";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not scheduled";
  return parsed.toLocaleString();
};

const levelBadge = (level) => {
  if (level === "mastered") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (level === "learning") return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
};

const alphaFromWord = (word = "") => {
  const first = String(word).trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
};

const LanguageLearningPage = ({
  itemType = "vocabulary",
  title = "Vocabulary Builder",
  subtitle = "Add, revise, and master your language items.",
  addButtonLabel = "Add Item",
  termLabel = "Word",
  meaningLabel = "Meaning",
  exampleLabel = "Example sentence",
  emptyText = "No items found",
}) => {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [stats, setStats] = useState({ total: 0, dueToday: 0, levels: { new: 0, learning: 0, mastered: 0 } });
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [sort, setSort] = useState("due");
  const [alphaFilter, setAlphaFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [practiceItems, setPracticeItems] = useState([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [showPracticeAnswer, setShowPracticeAnswer] = useState(false);
  const [loadingPractice, setLoadingPractice] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  const layoutProps = useMemo(
    () => ({
      title,
      subtitle,
      searchValue: search,
      onSearchChange: setSearch,
      searchPlaceholder: `Search ${termLabel.toLowerCase()}…`,
    }),
    [title, subtitle, search, termLabel]
  );

  const resetForm = () => {
    setEditingItem(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      word: item.word || "",
      meaning: item.meaning || "",
      example: item.example || "",
      synonyms: (item.synonyms || []).join(", "),
      tags: (item.tags || []).join(", "),
      level: item.level || "new",
    });
    setShowModal(true);
  };

  const fetchStats = async () => {
    const { data } = await api.get("/vocabulary/stats", { params: { type: itemType } });
    setStats(data || { total: 0, dueToday: 0, levels: { new: 0, learning: 0, mastered: 0 } });
  };

  const fetchItems = async () => {
    const alphaMode = Boolean(alphaFilter);
    const params = { page: alphaMode ? 1 : page, limit: alphaMode ? 100 : 20, sort, dueOnly, type: itemType };
    if (search) params.search = search;
    if (level) params.level = level;
    if (alphaFilter) params.alpha = alphaFilter;
    if (alphaMode) params.all = true;
    const { data } = await api.get("/vocabulary", { params });
    setItems(data.items || []);
    setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
  };

  const fetchPractice = async () => {
    setLoadingPractice(true);
    try {
      const { data } = await api.get("/vocabulary/practice", { params: { limit: 12, type: itemType } });
      setPracticeItems(data.items || []);
      setPracticeIndex(0);
      setShowPracticeAnswer(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load practice cards");
    } finally {
      setLoadingPractice(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchStats(), fetchItems(), fetchPractice()]);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [itemType]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchStats(), fetchItems()]);
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not refresh list");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [search, level, dueOnly, sort, alphaFilter, page, itemType]);

  useEffect(() => {
    setPage(1);
  }, [search, level, dueOnly, sort, alphaFilter]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.word.trim() || !form.meaning.trim()) {
      toast.error(`${termLabel} and ${meaningLabel} are required`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: itemType,
        word: form.word.trim(),
        meaning: form.meaning.trim(),
        example: form.example.trim(),
        synonyms: form.synonyms,
        tags: form.tags,
        level: form.level,
      };
      if (editingItem?._id) {
        await api.put(`/vocabulary/${editingItem._id}`, payload);
        toast.success("Updated successfully");
      } else {
        await api.post("/vocabulary", payload);
        toast.success("Added successfully");
      }
      setShowModal(false);
      resetForm();
      await Promise.all([fetchStats(), fetchItems(), fetchPractice()]);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save item");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      await api.delete(`/vocabulary/${id}`);
      toast.success("Deleted");
      await Promise.all([fetchStats(), fetchItems(), fetchPractice()]);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete item");
    }
  };

  const handleReview = async (id, result, fromPractice = false) => {
    try {
      await api.post(`/vocabulary/${id}/review`, { result });
      if (fromPractice) {
        setShowPracticeAnswer(false);
        setPracticeIndex((prev) => Math.min(prev + 1, practiceItems.length));
      }
      await Promise.all([fetchStats(), fetchItems(), fetchPractice()]);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not submit review");
    }
  };

  const practiceCard = practiceItems[practiceIndex] || null;
  const groupedItems = useMemo(() => {
    const bucket = {};
    items.forEach((item) => {
      const alpha = item.alphaLabel || alphaFromWord(item.word);
      if (!bucket[alpha]) bucket[alpha] = [];
      bucket[alpha].push(item);
    });
    return Object.entries(bucket).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const alphaOptions = useMemo(() => ["", ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))], []);

  const handleImport = async () => {
    if (!importFile) {
      toast.error("Please choose a CSV, Excel, or image file");
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("type", itemType);
      formData.append("file", importFile);
      const { data } = await api.post("/vocabulary/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(
        `Import done: ${data.inserted || 0} added, ${data.updated || 0} updated, ${data.skipped || 0} skipped`
      );
      setShowImportModal(false);
      setImportFile(null);
      await Promise.all([fetchStats(), fetchItems(), fetchPractice()]);
    } catch (error) {
      toast.error(error.response?.data?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleTextImport = async () => {
    if (!importText.trim()) {
      toast.error("Please paste your data first");
      return;
    }
    setImporting(true);
    try {
      const { data } = await api.post("/vocabulary/import-text", {
        type: itemType,
        text: importText,
      });
      toast.success(
        `Import done: ${data.inserted || 0} added, ${data.updated || 0} updated, ${data.skipped || 0} skipped`
      );
      setShowImportModal(false);
      setImportFile(null);
      setImportText("");
      await Promise.all([fetchStats(), fetchItems(), fetchPractice()]);
    } catch (error) {
      toast.error(error.response?.data?.message || "Text import failed");
    } finally {
      setImporting(false);
    }
  };

  const layoutActions = (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        className="btn-ghost text-sm"
        onClick={fetchPractice}
        disabled={loadingPractice}
      >
        <FiRefreshCw size={15} className={loadingPractice ? "animate-spin" : ""} />
        <span className="hidden sm:inline">Practice</span>
      </button>
      <button
        type="button"
        className="btn-ghost text-sm"
        onClick={() => setShowImportModal(true)}
      >
        <FiUpload size={15} />
        <span className="hidden sm:inline">Import</span>
      </button>
      <button type="button" className="btn-primary text-sm" onClick={openCreate}>
        <FiPlus size={15} />
        <span className="hidden sm:inline">{addButtonLabel}</span>
        <span className="sm:hidden">Add</span>
      </button>
    </div>
  );

  return (
    <Layout {...layoutProps} actions={layoutActions}>
      <div className="space-y-6">

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/80 dark:bg-slate-800/50">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/80 dark:bg-slate-800/50">
            <p className="text-xs uppercase tracking-wide text-slate-500">Due Today</p>
            <p className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">{stats.dueToday}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/80 dark:bg-slate-800/50">
            <p className="text-xs uppercase tracking-wide text-slate-500">Learning</p>
            <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.levels.learning || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/80 dark:bg-slate-800/50">
            <p className="text-xs uppercase tracking-wide text-slate-500">Mastered</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.levels.mastered || 0}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/80 dark:bg-slate-800/50">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
            <FiBookOpen />
            Practice Card
          </div>
          {loadingPractice ? (
            <p className="text-sm text-slate-500">Loading practice cards...</p>
          ) : !practiceCard ? (
            <p className="text-sm text-slate-500">No practice card available. Add items or refresh practice.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <p className="text-xs uppercase tracking-wide text-slate-500">{termLabel}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{practiceCard.word}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Card {Math.min(practiceIndex + 1, practiceItems.length)} of {practiceItems.length}
                </p>
              </div>
              {!showPracticeAnswer ? (
                <button type="button" className="btn-primary" onClick={() => setShowPracticeAnswer(true)}>
                  Show Answer
                </button>
              ) : (
                <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="text-sm">
                    <span className="font-semibold">{meaningLabel}:</span> {practiceCard.meaning}
                  </p>
                  {!!practiceCard.example && (
                    <p className="text-sm">
                      <span className="font-semibold">{exampleLabel}:</span> {practiceCard.example}
                    </p>
                  )}
                  {!!practiceCard.synonyms?.length && (
                    <p className="text-sm">
                      <span className="font-semibold">Synonyms:</span> {practiceCard.synonyms.join(", ")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" onClick={() => handleReview(practiceCard._id, "again", true)}>
                      Again
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => handleReview(practiceCard._id, "good", true)}>
                      Good
                    </button>
                    <button type="button" className="btn-primary" onClick={() => handleReview(practiceCard._id, "easy", true)}>
                      Easy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="card grid gap-2 p-3 sm:p-4 md:grid-cols-4">
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">All levels</option>
            <option value="new">New</option>
            <option value="learning">Learning</option>
            <option value="mastered">Mastered</option>
          </select>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="due">Due first</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="word">A-Z</option>
          </select>
          <select className="input" value={alphaFilter} onChange={(e) => setAlphaFilter(e.target.value)}>
            {alphaOptions.map((option) => (
              <option key={option || "all"} value={option}>
                {option ? `${option} Words` : "All alphabets"}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm dark:border-white/[0.06]">
            <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
            Due only
          </label>
        </section>

        <section className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader label="Loading items…" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <p className="font-semibold text-slate-700 dark:text-slate-200">{emptyText}</p>
              <p className="mt-1 text-sm text-slate-500">Add new items and start revising with smart review.</p>
            </div>
          ) : (
            groupedItems.map(([alpha, sectionItems]) => (
              <div key={alpha} className="space-y-3">
                <div className="sticky top-0 z-10 rounded-xl border border-slate-200/80 bg-slate-100/90 px-4 py-2 text-sm font-semibold text-slate-700 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                  {alpha} Words
                </div>
                {sectionItems.map((item) => (
                  <article
                    key={item._id}
                    className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-bold text-slate-800 dark:text-slate-100">{item.word}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${levelBadge(item.level)}`}>{item.level}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{item.meaning}</p>
                        {!!item.example && <p className="mt-1 text-sm italic text-slate-500">&quot;{item.example}&quot;</p>}
                        {!!item.synonyms?.length && (
                          <p className="mt-1 text-xs text-slate-500">
                            Synonyms: <span className="font-medium">{item.synonyms.join(", ")}</span>
                          </p>
                        )}
                        {!!item.tags?.length && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.tags.map((tag) => (
                              <span
                                key={`${item._id}-${tag}`}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="btn-secondary px-3 py-2" onClick={() => openEdit(item)}>
                          <FiEdit2 size={14} />
                        </button>
                        <button type="button" className="btn-secondary px-3 py-2" onClick={() => handleDelete(item._id)}>
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <FiClock size={12} />
                        Next review: {formatDate(item.nextReviewAt)}
                      </span>
                      <div className="flex gap-2">
                        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => handleReview(item._id, "again")}>
                          Again
                        </button>
                        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => handleReview(item._id, "good")}>
                          Good
                        </button>
                        <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => handleReview(item._id, "easy")}>
                          <FiCheckCircle size={12} /> Easy
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ))
          )}
        </section>

        {!alphaFilter ? (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-sm dark:border-slate-700/80 dark:bg-slate-800/50">
            <p className="text-slate-500">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} items)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={pagination.page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-sm text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/50">
            Showing all {pagination.total} words for <span className="font-semibold">{alphaFilter} Words</span>.
          </div>
        )}
      </div>

      {showModal &&
        createPortal(
          <div className="modal-overlay">
            <div className="modal-card max-w-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editingItem ? `Edit ${termLabel}` : addButtonLabel}</h3>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                <FiX />
              </button>
            </div>
            <form className="space-y-3" onSubmit={handleSave}>
              <input
                className="input"
                placeholder={termLabel}
                value={form.word}
                onChange={(e) => setForm((prev) => ({ ...prev, word: e.target.value }))}
              />
              <textarea
                className="input min-h-24"
                placeholder={meaningLabel}
                value={form.meaning}
                onChange={(e) => setForm((prev) => ({ ...prev, meaning: e.target.value }))}
              />
              <textarea
                className="input min-h-20"
                placeholder={`${exampleLabel} (optional)`}
                value={form.example}
                onChange={(e) => setForm((prev) => ({ ...prev, example: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Synonyms (comma separated)"
                value={form.synonyms}
                onChange={(e) => setForm((prev) => ({ ...prev, synonyms: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Tags (comma separated)"
                value={form.tags}
                onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
              />
              <select
                className="input"
                value={form.level}
                onChange={(e) => setForm((prev) => ({ ...prev, level: e.target.value }))}
              >
                <option value="new">New</option>
                <option value="learning">Learning</option>
                <option value="mastered">Mastered</option>
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? "Saving..." : editingItem ? "Update" : "Create"}
                </button>
              </div>
            </form>
            </div>
          </div>
          ,
          document.body
        )}

      {showImportModal &&
        createPortal(
          <div className="modal-overlay">
            <div className="modal-card max-w-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Import {termLabel}s</h3>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportText("");
                }}
              >
                <FiX />
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <p>Upload CSV, Excel (`.xlsx/.xls`), or image (`.png/.jpg/.jpeg/webp`).</p>
              <p className="text-xs text-slate-500">
                For CSV/Excel use columns like: `word`, `meaning`, `example`, `synonyms`, `tags`, `level`.
              </p>
              <input
                type="file"
                className="input"
                accept=".csv,.xls,.xlsx,image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
              {importFile && (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800">
                  Selected: <span className="font-medium">{importFile.name}</span>
                </p>
              )}
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Or paste text directly</p>
                <textarea
                  className="input min-h-40"
                  placeholder={`Word: Alibi
Meaning Hindi: अन्य उपस्थिति या बहाना
Meaning English: Proof that a person was somewhere else when a crime happened
Synonyms: shield, protection, excuse
Sentence: She provided an alibi, stating she was at work during the theft.

Word: Animosity
Meaning Hindi: शत्रुता
Meaning English: Strong hostility between people
Synonyms: hostility, hatred
Sentence: Their animosity affected the team.`}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportText("");
                  }}
                  disabled={importing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={handleImport}
                  disabled={!importFile || importing}
                >
                  {importing ? "Importing..." : "Import File"}
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={handleTextImport}
                  disabled={!importText.trim() || importing}
                >
                  {importing ? "Importing..." : "Import Text"}
                </button>
              </div>
            </div>
            </div>
          </div>
          ,
          document.body
        )}
    </Layout>
  );
};

export default LanguageLearningPage;
