import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  FiCopy,
  FiFolder,
  FiHardDrive,
  FiLoader,
  FiRefreshCw,
  FiSave,
  FiTrash2,
  FiZap,
} from "react-icons/fi";
import { Link, Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import { isLocalFrontend } from "../utils/media";
import {
  clearStreamCache,
  fetchLocalMediaStorage,
  fetchStreamCache,
  updateLocalMediaStorage,
} from "../utils/mediaStorageApi";

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Path copied");
  } catch {
    toast.error("Could not copy path");
  }
};

const LocalMediaStoragePage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [streamCache, setStreamCache] = useState(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [rootPath, setRootPath] = useState("");
  const [migrate, setMigrate] = useState(true);

  const loadStreamCache = useCallback(async () => {
    setCacheLoading(true);
    try {
      const { data } = await fetchStreamCache();
      setStreamCache(data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load stream cache");
    } finally {
      setCacheLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchLocalMediaStorage();
      setStatus(data);
      setRootPath(data.rootPath || "");
      await loadStreamCache();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load storage settings");
    } finally {
      setLoading(false);
    }
  }, [loadStreamCache]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isLocalFrontend()) {
    return <Navigate to="/" replace />;
  }

  const handleSave = async (event) => {
    event.preventDefault();
    if (saving || status?.envOverride) return;
    setSaving(true);
    try {
      const { data } = await updateLocalMediaStorage({
        rootPath: rootPath.trim(),
        migrate,
      });
      setStatus(data);
      setRootPath(data.rootPath || rootPath.trim());
      toast.success(data.message || "Storage location updated");
      await loadStreamCache();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update storage location");
    } finally {
      setSaving(false);
    }
  };

  const handleClearStreamCache = async (cacheKey = null) => {
    const label = cacheKey ? "this cached video" : "all stream cache";
    if (!window.confirm(`Remove ${label}? You can re-cache by watching again.`)) return;
    setClearingCache(true);
    try {
      const { data } = await clearStreamCache(cacheKey);
      setStreamCache(data);
      toast.success(data.message || "Stream cache cleared");
      const { data: storage } = await fetchLocalMediaStorage();
      setStatus(storage);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not clear cache");
    } finally {
      setClearingCache(false);
    }
  };

  const streamFolder = streamCache?.folderPath || `${status?.rootPath || ""}\\_stream_cache`;

  return (
    <Layout
      title="PC media storage"
      subtitle="Downloads, stream cache (fast seek), and merged full-course videos"
      showSearch={false}
      actions={
        <Link to="/" className="btn-ghost text-sm">
          Dashboard
        </Link>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-slate-400">
          <FiLoader className="animate-spin" /> Loading storage settings…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Media used</p>
              <p className="mt-2 text-2xl font-bold">{status?.usedLabel || "—"}</p>
              <p className="mt-1 text-xs text-slate-500">
                Library {status?.libraryLabel || "—"} · Merged {status?.mergedLabel || "—"}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stream cache</p>
              <p className="mt-2 text-2xl font-bold text-sky-700 dark:text-sky-300">
                {streamCache?.usedLabel || status?.streamCacheLabel || "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {streamCache?.itemCount ?? 0} video(s) · auto-saved while you watch
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Drive free space</p>
              <p className="mt-2 text-2xl font-bold">{status?.volume?.freeLabel || "—"}</p>
              <p className="mt-1 text-xs text-slate-500">
                {status?.volume?.totalLabel ? `Total ${status.volume.totalLabel}` : "On selected folder drive"}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Main folder</p>
              <p className="mt-2 break-all text-sm font-semibold text-violet-700 dark:text-violet-300">
                {status?.rootPath || "—"}
              </p>
              {status?.usingCustomRoot ? (
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Custom location active</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Using project uploads folder</p>
              )}
            </div>
          </div>

          <section id="stream-cache" className="card space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                  <FiZap size={18} />
                </span>
                <div>
                  <h2 className="text-base font-semibold">Stream cache (fast seek)</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                    When you watch or drag the timeline, video chunks are saved here so rewinds play from
                    your PC — not Telegram again.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={cacheLoading}
                  onClick={() => void loadStreamCache()}
                >
                  {cacheLoading ? <FiLoader size={14} className="animate-spin" /> : <FiRefreshCw size={14} />}
                  Refresh
                </button>
                <button
                  type="button"
                  className="btn-secondary text-xs text-rose-600 dark:text-rose-400"
                  disabled={clearingCache || !streamCache?.itemCount}
                  onClick={() => void handleClearStreamCache()}
                >
                  {clearingCache ? <FiLoader size={14} className="animate-spin" /> : <FiTrash2 size={14} />}
                  Clear all
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-sky-200/80 bg-sky-50/80 px-3 py-3 dark:border-sky-900/40 dark:bg-sky-950/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">
                Folder on your PC
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="break-all rounded-lg bg-white/80 px-2 py-1.5 font-mono text-xs text-slate-800 dark:bg-black/30 dark:text-slate-200">
                  {streamFolder}
                </code>
                <button
                  type="button"
                  className="btn-secondary shrink-0 text-xs"
                  onClick={() => void copyText(streamFolder)}
                >
                  <FiCopy size={13} /> Copy path
                </button>
              </div>
              <p className="mt-2 text-xs text-sky-900/80 dark:text-sky-200/80">
                Subfolder: <strong>_stream_cache</strong> inside your main media folder · Open in File Explorer
                and paste the path above.
              </p>
            </div>

            {cacheLoading && !streamCache?.items?.length ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <FiLoader className="animate-spin" /> Loading cached videos…
              </div>
            ) : !streamCache?.items?.length ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
                No stream cache yet. Open any lecture and seek — chunks will appear here.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/90 dark:border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Lesson</th>
                      <th className="px-3 py-2.5 font-semibold">Cached</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                    {streamCache.items.map((item) => (
                      <tr key={item.cacheKey} className="bg-white dark:bg-[#1a1a1a]">
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
                          {item.subjectName ? (
                            <p className="mt-0.5 text-xs text-slate-500">{item.subjectName}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                              <div
                                className={`h-full rounded-full ${
                                  item.complete ? "bg-emerald-500" : "bg-sky-500"
                                }`}
                                style={{ width: `${item.cachedPercent}%` }}
                              />
                            </div>
                            <span className="text-xs">
                              {item.cachedLabel} / {item.totalLabel} ({item.cachedPercent}%)
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {item.complete ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                              Full file
                            </span>
                          ) : (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                              Partial
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {item.contentId ? (
                              <Link to={`/video/${item.contentId}`} className="btn-secondary text-xs">
                                Open
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              className="btn-secondary text-xs text-rose-600"
                              disabled={clearingCache}
                              onClick={() => void handleClearStreamCache(item.cacheKey)}
                            >
                              <FiTrash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <form onSubmit={handleSave} className="card space-y-4 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                <FiFolder size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">Change storage drive / folder</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Downloads (PC library) and stream cache both live under this folder.
                </p>
              </div>
            </div>

            {status?.envOverride ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                <strong>LOCAL_MEDIA_ROOT</strong> is set in <code>server/.env</code> and overrides this page.
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Folder path on your PC
              </span>
              <input
                className="input w-full font-mono text-sm"
                value={rootPath}
                onChange={(event) => setRootPath(event.target.value)}
                placeholder="E:\CDS Journey Media"
                disabled={Boolean(status?.envOverride) || saving}
              />
            </label>

            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={migrate}
                onChange={(event) => setMigrate(event.target.checked)}
                disabled={Boolean(status?.envOverride) || saving}
              />
              <span>
                Move existing media files to the new folder (recommended when your D drive is full).
              </span>
            </label>

            <button
              type="submit"
              className="btn-primary"
              disabled={Boolean(status?.envOverride) || saving || !rootPath.trim()}
            >
              {saving ? <FiLoader size={14} className="animate-spin" /> : <FiSave size={14} />}
              Save location
            </button>

            <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <FiHardDrive size={14} className="mt-0.5 shrink-0" />
              Default project folder: <span className="break-all font-mono">{status?.defaultRootPath}</span>
            </p>
          </form>
        </div>
      )}
    </Layout>
  );
};

export default LocalMediaStoragePage;
