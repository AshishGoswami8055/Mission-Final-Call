import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiAlertTriangle,
  FiCloud,
  FiExternalLink,
  FiHardDrive,
  FiLoader,
  FiRefreshCw,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import api from "../api/client";
import Layout from "../components/Layout";

const percentClass = (value) => {
  if (value == null) return "bg-teal-500";
  if (value >= 90) return "bg-rose-500";
  if (value >= 75) return "bg-amber-500";
  return "bg-teal-500";
};

const CloudAccountCard = ({ item, defaultCloud }) => {
  const storageUsedBytes = Number(item.storageTotalBytes ?? item.storageBytes ?? 0) || 0;
  const storageLimitBytes = Number(item.storageLimitBytes ?? 0) || 0;
  const objectCount = Number(item.objectsCount ?? 0) || 0;
  const isEmpty = storageUsedBytes === 0 && objectCount === 0;

  const percent = (() => {
    if (item.storagePercentUsed != null) {
      return Math.min(100, Math.max(0, Number(item.storagePercentUsed)));
    }
    if (storageLimitBytes > 0 && storageUsedBytes > 0) {
      return Math.min(100, (storageUsedBytes / storageLimitBytes) * 100);
    }
    return null;
  })();

  const barWidth = (() => {
    if (isEmpty || percent == null || percent <= 0) return 0;
    return percent < 1.5 ? 2 : percent;
  })();

  const urls = item.consoleUrls || {};

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/40 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {item.cloudName || item.cloudType}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {item.cloudType}
            </span>
            {defaultCloud === item.cloudType ? (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                Default
              </span>
            ) : null}
          </div>
          {item.plan ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Plan: {item.plan}</p>
          ) : null}
        </div>
        {item.ok && !item.usageDisabled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            Live
          </span>
        ) : null}
      </div>

      {!item.ok ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <FiAlertTriangle className="mt-0.5 shrink-0" size={16} />
            <div className="space-y-2">
              <p className="font-medium">{item.error || "Could not load usage for this account"}</p>
              {item.permissionHint ? (
                <p className="text-xs leading-relaxed opacity-90">{item.permissionHint}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : item.usageDisabled ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Usage reporting is disabled for this account on the server.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Storage</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">
                  {isEmpty
                    ? `0 B${item.storageLimitLabel ? ` / ${item.storageLimitLabel}` : ""}`
                    : `${item.storageTotalLabel || item.storageLabel || "—"}${item.storageLimitLabel ? ` / ${item.storageLimitLabel}` : ""}`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                    isEmpty ? "bg-transparent" : percentClass(percent)
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                {isEmpty ? (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">Empty — ready for uploads</span>
                ) : null}
                {!isEmpty && item.storageRemainingLabel ? (
                  <span>
                    <strong className="text-slate-700 dark:text-slate-200">
                      {item.storageRemainingLabel}
                    </strong>{" "}
                    remaining
                  </span>
                ) : null}
                {percent != null && !isEmpty ? <span>{percent.toFixed(1)}% used</span> : null}
                {item.storageLimitFromPlan && !isEmpty ? (
                  <span className="text-slate-400">Limit estimated from Free plan (25 GB)</span>
                ) : null}
                {!isEmpty && item.derivedLabel ? <span>Derived: {item.derivedLabel}</span> : null}
                {item.objectsCount != null ? <span>{item.objectsCount} assets</span> : null}
              </div>
            </div>

            {item.bandwidthLabel ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bandwidth this period: <strong>{item.bandwidthLabel}</strong>
              </p>
            ) : null}
            {item.creditsLabel ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{item.creditsLabel}</p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {urls.mediaLibrary ? (
              <a
                href={urls.mediaLibrary}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs"
              >
                <FiExternalLink size={13} /> Media library
              </a>
            ) : null}
            {urls.usage ? (
              <a
                href={urls.usage}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs"
              >
                <FiExternalLink size={13} /> Usage in Cloudinary
              </a>
            ) : null}
            {urls.dashboard ? (
              <a
                href={urls.dashboard}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-xs"
              >
                Open console
              </a>
            ) : null}
          </div>
        </>
      )}
    </article>
  );
};

const CloudinaryStoragePage = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [defaultCloud, setDefaultCloud] = useState(null);
  const [meta, setMeta] = useState({ refreshedAt: null, cached: false });

  const loadUsage = useCallback(async (refresh = false, { silent = false } = {}) => {
    if (!silent) {
      if (refresh) setRefreshing(true);
      else setLoading(true);
    }
    try {
      const [usageRes, cloudsRes] = await Promise.all([
        api.get("/cloud-mappings/usage", { params: refresh ? { refresh: 1 } : {} }),
        api.get("/cloud-mappings/clouds"),
      ]);
      setItems(usageRes.data.items || []);
      setDefaultCloud(cloudsRes.data.default || null);
      setMeta({
        refreshedAt: usageRes.data.refreshedAt || null,
        cached: Boolean(usageRes.data.cached),
      });
    } catch (error) {
      if (!silent) {
        toast.error(error.response?.data?.message || "Could not load Cloudinary storage");
      }
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadUsage(false);
    const interval = window.setInterval(() => {
      void loadUsage(true, { silent: true });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadUsage]);

  const summary = useMemo(() => {
    const live = items.filter((item) => item.ok && !item.usageDisabled);
    const totalUsed = live.reduce((sum, item) => sum + (item.storageTotalBytes || 0), 0);
    const totalLimit = live.reduce((sum, item) => sum + (item.storageLimitBytes || 0), 0);
    const totalRemaining =
      totalLimit > 0 && totalUsed >= 0 ? Math.max(0, totalLimit - totalUsed) : null;
    return { totalUsed, totalLimit, totalRemaining, accountCount: items.length };
  }, [items]);

  const formatSummary = (bytes) => {
    if (!bytes && bytes !== 0) return "—";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <Layout
      title="Cloudinary storage"
      subtitle="Remaining space across your video & PDF accounts"
      showSearch={false}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/" className="btn-ghost text-sm">
            Dashboard
          </Link>
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => void loadUsage(true)}
            disabled={refreshing}
          >
            {refreshing ? <FiLoader className="animate-spin" size={14} /> : <FiRefreshCw size={14} />}
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-sky-500 to-teal-600 text-white shadow-md">
              <FiHardDrive size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {summary.accountCount} Cloudinary account{summary.accountCount === 1 ? "" : "s"} configured
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {summary.totalRemaining != null
                  ? `${formatSummary(summary.totalRemaining)} remaining of ${formatSummary(summary.totalLimit)} total`
                  : "Delete lessons & papers from the app to free Cloudinary storage automatically."}
              </p>
              {meta.refreshedAt ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  Updated {new Date(meta.refreshedAt).toLocaleString()}
                  {meta.cached ? " · cached 60s" : ""}
                </p>
              ) : null}
            </div>
          </div>
          <Link to="/" className="btn-secondary text-xs" title="Subject → cloud routing">
            <FiCloud size={14} /> Cloud routing (dashboard)
          </Link>
        </section>

        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
            <FiLoader className="animate-spin text-2xl text-teal-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
            No Cloudinary accounts configured on the server.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((item) => (
              <CloudAccountCard key={item.cloudType} item={item} defaultCloud={defaultCloud} />
            ))}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-700/80 dark:bg-slate-900/30 dark:text-slate-400 sm:p-5">
          <p className="font-semibold text-slate-800 dark:text-slate-200">Automatic cleanup</p>
          <p className="mt-1">
            When you delete a video, lesson PDF, or PYQ paper in this app, the matching Cloudinary
            file is removed too (including legacy items that only stored the delivery URL). Thumbnails
            on Cloudinary are deleted with the lesson.
          </p>
        </section>
      </div>
    </Layout>
  );
};

export default CloudinaryStoragePage;
