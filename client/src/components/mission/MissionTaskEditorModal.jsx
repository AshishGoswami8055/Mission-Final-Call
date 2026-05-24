import { useCallback, useEffect, useState } from "react";
import { FiClock, FiEdit2, FiPlay, FiPlus, FiSearch, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import api from "../../api/client";

const SLOT_LABELS = {
  english: "English video",
  maths: "Maths video",
  gs: "GS video",
  reading: "Reading session",
  custom: "Extra task",
};

const SLOT_ACCENT = {
  english: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
  maths: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200",
  gs: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  reading: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
  custom: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
};

const fieldLabel =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

const MissionTaskEditorModal = ({ target, mode = "edit", onClose, onSaved }) => {
  const isAdd = mode === "add";
  const isReading = target?.slot === "reading";
  const isVideoSlot = ["english", "maths", "gs"].includes(target?.slot);
  const isCustom = isAdd || target?.slot === "custom";
  const slotKey = isAdd ? "custom" : target?.slot;

  const [title, setTitle] = useState(target?.title || "");
  const [durationMinutes, setDurationMinutes] = useState(target?.minutes || 30);
  const [search, setSearch] = useState("");
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [saving, setSaving] = useState(false);

  const pickerSlot = isVideoSlot ? target.slot : isAdd || isCustom ? undefined : target?.slot;

  const loadVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      const { data } = await api.get("/mission/videos/picker", {
        params: {
          slot: pickerSlot,
          search: search.trim() || undefined,
          limit: 40,
        },
      });
      setVideos(data.items || []);
    } catch {
      toast.error("Could not load videos");
    } finally {
      setLoadingVideos(false);
    }
  }, [pickerSlot, search]);

  useEffect(() => {
    if (isReading) return;
    const timer = setTimeout(loadVideos, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [isReading, loadVideos, search]);

  useEffect(() => {
    if (target?.contentId && videos.length) {
      const match = videos.find((v) => String(v._id) === String(target.contentId));
      if (match) setSelectedVideo(match);
    }
  }, [target?.contentId, videos]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let response;
      if (isAdd) {
        response = await api.post("/mission/items/manual", {
          title: title.trim() || selectedVideo?.title,
          contentId: selectedVideo?._id,
          durationMinutes: Number(durationMinutes) || 30,
        });
        toast.success("Task added.");
      } else if (isReading) {
        response = await api.put("/mission/items/update", {
          slot: "reading",
          targetMinutes: Number(durationMinutes) || 60,
        });
        toast.success("Reading target updated.");
      } else if (isVideoSlot) {
        if (!selectedVideo?._id) {
          toast.error("Pick a video");
          setSaving(false);
          return;
        }
        response = await api.put("/mission/items/update", {
          slot: target.slot,
          contentId: selectedVideo._id,
        });
        toast.success("Task updated.");
      } else {
        response = await api.put("/mission/items/update", {
          itemId: target.itemId,
          title: title.trim(),
          contentId: selectedVideo?._id,
          durationMinutes: Number(durationMinutes) || 30,
        });
        toast.success("Task updated.");
      }
      onSaved?.(response.data);
      onClose?.();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save task");
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = isAdd ? "Add manual task" : `Edit ${SLOT_LABELS[target?.slot] || "task"}`;
  const HeaderIcon = isAdd ? FiPlus : FiEdit2;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card modal-card-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/10">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
              <HeaderIcon size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">{modalTitle}</h2>
                {slotKey && (
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SLOT_ACCENT[slotKey] || SLOT_ACCENT.custom}`}>
                    {SLOT_LABELS[slotKey]?.replace(" video", "").replace(" session", "") || "Task"}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {isReading
                  ? "Set how long you want to read today."
                  : isVideoSlot
                    ? "Replace the AI pick with any video from your library."
                    : "Add your own study task or link a video."}
              </p>
            </div>
          </div>
          <button type="button" className="btn-ghost shrink-0 p-2!" onClick={onClose} aria-label="Close">
            <FiX size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {isReading ? (
            <label className="block">
              <span className={fieldLabel}>Duration (minutes)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={15}
                  max={240}
                  className="input w-28"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />
                <span className="text-sm text-slate-500">min</span>
              </div>
            </label>
          ) : (
            <>
              {(isCustom || isAdd) && (
                <label className="block">
                  <span className={fieldLabel}>Task title</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Revise Polity notes"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
              )}

              {(isCustom || isAdd || isVideoSlot) && (
                <>
                  <label className="block">
                    <span className={fieldLabel}>{isVideoSlot ? "Pick a video" : "Link a video (optional)"}</span>
                    <div className="relative">
                      <FiSearch
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        size={15}
                      />
                      <input
                        type="search"
                        className="input pl-10"
                        placeholder="Search videos…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </label>

                  <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="max-h-56 overflow-y-auto p-2">
                      {loadingVideos && (
                        <p className="px-3 py-4 text-center text-sm text-slate-500">Loading videos…</p>
                      )}
                      {!loadingVideos && !videos.length && (
                        <p className="px-3 py-4 text-center text-sm text-slate-500">No videos found.</p>
                      )}
                      <ul className="space-y-1.5">
                        {videos.map((video) => {
                          const selected = String(selectedVideo?._id) === String(video._id);
                          return (
                            <li key={video._id}>
                              <button
                                type="button"
                                className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                                  selected
                                    ? "border-slate-900 bg-white shadow-sm dark:border-slate-100 dark:bg-[#1a1a1a]"
                                    : "border-transparent bg-white hover:border-slate-200 dark:bg-[#141414] dark:hover:border-white/10"
                                }`}
                                onClick={() => {
                                  setSelectedVideo(video);
                                  if (isCustom || isAdd) setTitle((prev) => prev || video.title);
                                  if (isCustom || isAdd) setDurationMinutes(video.durationMinutes || 30);
                                }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{video.title}</p>
                                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                                      {[video.subjectName, video.chapterName].filter(Boolean).join(" · ")}
                                    </p>
                                  </div>
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] font-medium tabular-nums text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                                    <FiClock size={11} />
                                    {video.durationMinutes}m
                                  </span>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>

                  {selectedVideo && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-[#141414]">
                      <FiPlay size={14} className="shrink-0 text-slate-500" />
                      <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                        Selected: <span className="font-medium">{selectedVideo.title}</span>
                      </span>
                    </div>
                  )}
                </>
              )}

              {(isCustom || isAdd) && (
                <label className="block">
                  <span className={fieldLabel}>Duration (minutes)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={240}
                      className="input w-28"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                    />
                    <span className="text-sm text-slate-500">min</span>
                  </div>
                </label>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-white/10">
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary w-full sm:w-auto" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : isAdd ? "Add task" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MissionTaskEditorModal;
