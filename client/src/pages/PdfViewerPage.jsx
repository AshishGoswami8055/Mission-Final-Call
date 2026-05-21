import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowLeft, FiCheck, FiCloud } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import Loader from "../components/Loader";
import { isTelegramStreamContent, resolveContentSrc } from "../utils/media";

const PdfViewerPage = () => {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [docReady, setDocReady] = useState(false);
  const [loadPercent, setLoadPercent] = useState(0);

  useEffect(() => {
    const fetchItem = async () => {
      try {
        setLoadPercent(8);
        const { data } = await api.get(`/contents/${id}`);
        setItem(data);
        setLoadPercent(25);
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not load document");
      }
    };
    fetchItem();
  }, [id]);

  const src = useMemo(() => (item ? resolveContentSrc(item) : ""), [item]);
  const isTelegramPdf = item && isTelegramStreamContent(item);
  const isCloudPdf = item?.sourceType === "cloudinary";

  useEffect(() => {
    if (!item || !src) return undefined;
    setDocReady(false);
    setLoadPercent((p) => Math.max(p, 30));

    const timer = setInterval(() => {
      setLoadPercent((prev) => {
        if (docReady || prev >= 92) return prev;
        return prev + (isCloudPdf ? 4 : 2);
      });
    }, 350);

    return () => clearInterval(timer);
  }, [item, src, isCloudPdf, docReady]);

  if (!item) {
    return <Loader fullPage label="Opening document…" percent={loadPercent} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-4">
        <Link to="/" className="btn-secondary inline-flex">
          <FiArrowLeft /> Back
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{item.title}</h1>
              <p className="text-sm text-slate-500">
                {item.subjectId?.name} / {item.chapterId?.chapterName}
              </p>
            </div>
            {isCloudPdf && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                <FiCloud size={12} /> Cloudinary CDN
              </span>
            )}
          </div>

          {!docReady && !loadError && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {isCloudPdf ? "Loading PDF from CDN…" : isTelegramPdf ? "Streaming PDF from Telegram…" : "Loading PDF…"}
                </p>
                <span className="font-display text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">
                  {loadPercent}%
                </span>
              </div>
              <div className="progress-bar h-2.5">
                <div
                  className="progress-bar-fill progress-bar-fill-default h-full transition-all duration-300"
                  style={{ width: `${loadPercent}%` }}
                />
              </div>
            </div>
          )}

          {loadError ? (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
              {loadError}
            </p>
          ) : null}

          {src ? (
            <>
              <iframe
                title={item.title}
                src={src}
                className={`mt-4 h-[75vh] w-full rounded-lg border border-slate-300 transition-opacity duration-300 ${
                  docReady ? "opacity-100" : "opacity-0"
                }`}
                onLoad={() => {
                  setDocReady(true);
                  setLoadPercent(100);
                }}
                onError={() =>
                  setLoadError(
                    isTelegramPdf
                      ? "Could not stream PDF. Re-import to upload PDFs to Cloudinary for faster loading."
                      : "Could not load PDF. Try refreshing."
                  )
                }
              />
              {!docReady && !loadError && (
                <div className="mt-[-75vh] flex h-[75vh] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/80 dark:border-slate-700 dark:bg-slate-900/80">
                  <Loader label={isCloudPdf ? "Preparing document…" : "Connecting to PDF source…"} percent={loadPercent} />
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No document source available.</p>
          )}

          {isTelegramPdf && src && docReady ? (
            <a href={src} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-3 inline-flex text-sm">
              Open PDF in new tab
            </a>
          ) : null}
          {isCloudPdf && docReady ? (
            <p className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <FiCheck size={12} /> Optimized via Cloudinary
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PdfViewerPage;
