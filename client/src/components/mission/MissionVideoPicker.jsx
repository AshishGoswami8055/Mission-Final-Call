import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiChevronRight,
  FiClock,
  FiGrid,
  FiList,
  FiPlay,
  FiSearch,
} from "react-icons/fi";
import toast from "react-hot-toast";
import api from "../../api/client";
import SubjectGridCard from "../SubjectGridCard";
import { getContentDateLabels } from "../../utils/contentDates";

const fieldLabel =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

const MissionVideoPicker = ({ selectedVideo, onSelect, slotLabel }) => {
  const [view, setView] = useState("subjects");
  const [subjects, setSubjects] = useState([]);
  const [videos, setVideos] = useState([]);
  const [activeSubject, setActiveSubject] = useState(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [videoSearch, setVideoSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const loadSubjects = useCallback(async (search = "") => {
    setLoadingSubjects(true);
    try {
      const { data } = await api.get("/mission/videos/picker/subjects", {
        params: { search: search.trim() || undefined },
      });
      setSubjects(data.items || []);
    } catch {
      toast.error("Could not load subjects");
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  const loadVideos = useCallback(async ({ subjectId, search = "" } = {}) => {
    setLoadingVideos(true);
    try {
      const { data } = await api.get("/mission/videos/picker", {
        params: {
          subjectId: subjectId || undefined,
          search: search.trim() || undefined,
          limit: 5000,
        },
      });
      setVideos(data.items || []);
    } catch {
      toast.error("Could not load videos");
      setVideos([]);
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadSubjects(subjectSearch), subjectSearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadSubjects, subjectSearch]);

  useEffect(() => {
    if (view !== "videos" || !activeSubject?._id) return;
    const timer = setTimeout(
      () => loadVideos({ subjectId: activeSubject._id, search: videoSearch }),
      videoSearch ? 250 : 0
    );
    return () => clearTimeout(timer);
  }, [view, activeSubject, videoSearch, loadVideos]);

  useEffect(() => {
    if (!globalSearch.trim()) return;
    const timer = setTimeout(async () => {
      setView("search");
      setLoadingVideos(true);
      try {
        const { data } = await api.get("/mission/videos/picker", {
          params: { search: globalSearch.trim(), limit: 5000 },
        });
        setVideos(data.items || []);
      } catch {
        toast.error("Search failed");
        setVideos([]);
      } finally {
        setLoadingVideos(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  const openSubject = (subject) => {
    setActiveSubject(subject);
    setVideoSearch("");
    setView("videos");
  };

  const backToSubjects = () => {
    setView("subjects");
    setActiveSubject(null);
    setVideos([]);
    setVideoSearch("");
    setGlobalSearch("");
  };

  const filteredSubjects = useMemo(() => subjects, [subjects]);

  const handleSelect = (video) => {
    onSelect?.(video);
  };

  const renderVideoRow = (video) => {
    const selected = String(selectedVideo?._id) === String(video._id);
    const { posted, added, isNew } = getContentDateLabels(video);

    return (
      <button
        key={video._id}
        type="button"
        className={`w-full rounded-xl border px-3 py-3 text-left transition-all sm:px-4 ${
          selected
            ? "border-slate-900 bg-white shadow-sm dark:border-slate-100 dark:bg-[#1a1a1a]"
            : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-[#141414] dark:hover:border-white/20"
        }`}
        onClick={() => handleSelect(video)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
              {video.title}
              {isNew && (
                <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  New
                </span>
              )}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>{[video.subjectName, video.chapterName].filter(Boolean).join(" · ")}</span>
              {posted && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>Posted {posted}</span>
                </>
              )}
              {added && added !== posted && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>Added {added}</span>
                </>
              )}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] font-medium tabular-nums text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
            <FiClock size={11} />
            {video.durationMinutes}m
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className={fieldLabel}>Browse your full video library</span>
        <div className="relative">
          <FiSearch
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            size={15}
          />
          <input
            type="search"
            className="input pl-10"
            placeholder="Search all videos by title…"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Pick any video from any subject{slotLabel ? ` for your ${slotLabel}` : ""} — not just recent picks.
        </p>
      </label>

      {view === "subjects" && !globalSearch.trim() && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {loadingSubjects ? "Loading subjects…" : `${filteredSubjects.length} subjects with videos`}
            </p>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200/80 p-0.5 dark:border-white/10">
              <button
                type="button"
                className={`rounded-md p-1.5 transition ${
                  viewMode === "grid"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                }`}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <FiGrid size={14} />
              </button>
              <button
                type="button"
                className={`rounded-md p-1.5 transition ${
                  viewMode === "list"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                }`}
                onClick={() => setViewMode("list")}
                title="List view"
              >
                <FiList size={14} />
              </button>
            </div>
          </div>

          <div className="relative">
            <FiSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
            <input
              type="search"
              className="input py-2! pl-9! text-sm"
              placeholder="Filter subjects…"
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
            />
          </div>

          {loadingSubjects ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading subjects…</p>
          ) : viewMode === "grid" ? (
            <div className="grid max-h-[min(52vh,520px)] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSubjects.map((subject, index) => (
                <SubjectGridCard
                  key={subject._id}
                  subject={subject}
                  index={index}
                  stats={{ videos: subject.videos, pdfs: 0, completed: 0 }}
                  compact
                  pickerMode
                  onClick={() => openSubject(subject)}
                />
              ))}
            </div>
          ) : (
            <div className="max-h-[min(52vh,520px)] space-y-2 overflow-y-auto pr-1">
              {filteredSubjects.map((subject, index) => (
                <button
                  key={subject._id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-left transition hover:border-slate-300 dark:border-white/10 dark:bg-[#141414] dark:hover:border-white/20"
                  onClick={() => openSubject(subject)}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                    {String(subject.name || "?").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {subject.name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {subject.videos} video{subject.videos === 1 ? "" : "s"}
                    </span>
                  </span>
                  <FiChevronRight className="shrink-0 text-slate-400" size={16} />
                </button>
              ))}
            </div>
          )}

          {!loadingSubjects && !filteredSubjects.length && (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/10">
              No subjects with videos found.
            </p>
          )}
        </>
      )}

      {(view === "videos" || globalSearch.trim()) && (
        <>
          {!globalSearch.trim() && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              onClick={backToSubjects}
            >
              <FiArrowLeft size={14} />
              All subjects
            </button>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {globalSearch.trim()
                ? `Search results for “${globalSearch.trim()}”`
                : activeSubject?.name || "Videos"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {loadingVideos ? "Loading…" : `${videos.length} video${videos.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {!globalSearch.trim() && (
            <div className="relative">
              <FiSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={14}
              />
              <input
                type="search"
                className="input py-2! pl-9! text-sm"
                placeholder="Search in this subject…"
                value={videoSearch}
                onChange={(e) => setVideoSearch(e.target.value)}
              />
            </div>
          )}

          <div className="max-h-[min(52vh,520px)] space-y-2 overflow-y-auto pr-1">
            {loadingVideos && (
              <p className="py-8 text-center text-sm text-slate-500">Loading videos…</p>
            )}
            {!loadingVideos && !videos.length && (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/10">
                No videos found.
              </p>
            )}
            {!loadingVideos && videos.map((video) => renderVideoRow(video))}
          </div>
        </>
      )}

      {selectedVideo && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2.5 text-sm dark:border-emerald-500/30 dark:bg-emerald-950/20">
          <FiPlay size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
            Selected: <span className="font-medium">{selectedVideo.title}</span>
            {selectedVideo.subjectName ? (
              <span className="text-slate-500"> · {selectedVideo.subjectName}</span>
            ) : null}
          </span>
        </div>
      )}
    </div>
  );
};

export default MissionVideoPicker;
