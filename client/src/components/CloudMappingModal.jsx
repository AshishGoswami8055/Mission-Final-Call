import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { FiCloud, FiRefreshCw, FiSearch, FiSave, FiX } from "react-icons/fi";
import api from "../api/client";

const CloudMappingModal = ({ onClose, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState([]);
  const [defaultCloud, setDefaultCloud] = useState(null);
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState({});
  const [search, setSearch] = useState("");
  const [cycleFilter, setCycleFilter] = useState("");

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/cloud-mappings");
      setAvailable(data.available || []);
      setDefaultCloud(data.default || null);
      setRows(data.items || []);
      setPending({});
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load cloud mappings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const cycles = useMemo(() => {
    const set = new Set(rows.map((r) => r.cdsCycleId).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (cycleFilter && row.cdsCycleId !== cycleFilter) return false;
      if (!q) return true;
      const hay = `${row.subjectName} ${row.programmeName || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, cycleFilter]);

  const noCloudsConfigured = available.length === 0;
  const dirtyCount = Object.keys(pending).length;

  const handleSelect = (row, nextCloud) => {
    const current = row.assignedCloud || "";
    setPending((prev) => {
      const next = { ...prev };
      if (nextCloud === current) {
        delete next[row.subjectId];
      } else {
        next[row.subjectId] = nextCloud;
      }
      return next;
    });
  };

  const handleSave = async () => {
    const entries = Object.entries(pending);
    if (!entries.length) return;
    setSaving(true);
    try {
      const toAssign = entries.filter(([, v]) => v);
      const toClear = entries.filter(([, v]) => !v);

      if (toAssign.length) {
        await api.put("/cloud-mappings/bulk", {
          items: toAssign.map(([subjectId, cloudType]) => ({ subjectId, cloudType })),
        });
      }
      for (const [subjectId] of toClear) {
        await api.delete(`/cloud-mappings/${subjectId}`);
      }
      toast.success(`Saved ${entries.length} mapping(s)`);
      await fetchMappings();
      onSaved?.();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save mappings");
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div className="modal-overlay">
      <div className="modal-card w-full max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-indigo-500 text-white shadow-md">
              <FiCloud size={18} />
            </span>
            <div>
              <h3 className="text-lg font-semibold">Cloudinary routing</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Pick which Cloudinary account each subject should upload to.
                Unassigned subjects fall back to the default cloud.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            <FiX />
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              className="input pl-8"
              placeholder="Search subject or batch…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input"
            value={cycleFilter}
            onChange={(e) => setCycleFilter(e.target.value)}
          >
            <option value="">All cycles</option>
            {cycles.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={fetchMappings} disabled={loading}>
            <FiRefreshCw className={loading ? "animate-spin" : ""} />
            Reload
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
          <span className="font-semibold">Default cloud:</span>{" "}
          {defaultCloud ? (
            <span className="font-mono">{defaultCloud}</span>
          ) : (
            <span className="text-rose-500">none configured</span>
          )}
          <span className="mx-2">·</span>
          <span className="font-semibold">Available:</span>{" "}
          {available.length ? (
            available.map((c) => (
              <span
                key={c}
                className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
              >
                {c}
              </span>
            ))
          ) : (
            <span className="text-rose-500">none configured (set CLOUDINARY_* env vars on the server)</span>
          )}
        </div>

        <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Loading subjects…</p>
          ) : !filteredRows.length ? (
            <p className="p-6 text-sm text-slate-500">No subjects match the current filters.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100/95 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Batch / cycle</th>
                  <th className="px-3 py-2">Assigned cloud</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const pendingValue = pending[row.subjectId];
                  const isDirty = pendingValue !== undefined;
                  const current = isDirty ? pendingValue : (row.assignedCloud || "");
                  const effective = current || defaultCloud || "";
                  return (
                    <tr
                      key={row.subjectId}
                      className={`border-t border-slate-100 dark:border-slate-800 ${
                        isDirty ? "bg-amber-50/60 dark:bg-amber-900/10" : ""
                      }`}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{row.subjectName}</p>
                        {!row.assignedCloud && !isDirty && (
                          <p className="text-[11px] text-slate-500">Using default ({defaultCloud || "—"})</p>
                        )}
                        {isDirty && (
                          <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            Unsaved change
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {row.programmeName || "—"}
                        {row.cdsCycleId ? ` · ${row.cdsCycleId}` : ""}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="input py-1.5"
                          value={current}
                          onChange={(e) => handleSelect(row, e.target.value)}
                          disabled={noCloudsConfigured}
                        >
                          <option value="">
                            Default {defaultCloud ? `(${defaultCloud})` : ""}
                          </option>
                          {available.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Effective: <span className="font-mono">{effective || "—"}</span>
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {dirtyCount > 0 ? `${dirtyCount} change(s) ready to save` : "No pending changes"}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Close
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={!dirtyCount || saving || noCloudsConfigured}
            >
              <FiSave />
              {saving ? "Saving…" : "Save mappings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default CloudMappingModal;
