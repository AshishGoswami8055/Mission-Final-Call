import { useCallback, useEffect, useState } from "react";
import { FiSearch, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import api from "../../api/client";

const SLOT_LABELS = {
  english: "English video",
  maths: "Maths video",
  gs: "GS video",
  reading: "Reading session",
  custom: "Extra task",
};

const MissionTaskEditorModal = ({ target, mode = "edit", onClose, onSaved }) => {
  const isAdd = mode === "add";
  const isReading = target?.slot === "reading";
  const isVideoSlot = ["english", "maths", "gs"].includes(target?.slot);
  const isCustom = isAdd || target?.slot === "custom";

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

  const modalTitle = isAdd
    ? "Add manual task"
    : `Edit ${SLOT_LABELS[target?.slot] || "task"}`;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card-lg w-full max-w-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">{modalTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isReading
                ? "Set how long you want to read today."
                : isVideoSlot
                  ? "Replace the AI pick with any video from your library."
                  : "Add your own study task or link a video."}
            </p>
          </div>
          <button type="button" className="btn-ghost p-2!" onClick={onClose} aria-label="Close">
            <FiX size={18} />
          </button>
        </div>

        {isReading ? (
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Duration (minutes)</span>
            <input
              type="number"
              min={15}
              max={240}
              className="input mt-1.5"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </label>
        ) : (
          <div className="space-y-4">
            {(isCustom || isAdd) && (
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Task title</span>
                <input
                  type="text"
                  className="input mt-1.5"
                  placeholder="e.g. Revise Polity notes"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            )}

            {(isCustom || isAdd || isVideoSlot) && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {isVideoSlot ? "Pick a video" : "Link a video (optional)"}
                  </span>
                  <div className="relative mt-1.5">
                    <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="search"
                      className="input pl-9"
                      placeholder="Search videos…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </label>

                <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-white/10">
                  {loadingVideos && <p className="px-2 py-3 text-sm text-slate-500">Loading videos…</p>}
                  {!loadingVideos && !videos.length && (
                    <p className="px-2 py-3 text-sm text-slate-500">No videos found.</p>
                  )}
                  {videos.map((video) => {
                    const selected = String(selectedVideo?._id) === String(video._id);
                    return (
                      <button
                        key={video._id}
                        type="button"
                        className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          selected
                            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                            : "hover:bg-slate-50 dark:hover:bg-white/5"
                        }`}
                        onClick={() => {
                          setSelectedVideo(video);
                          if (isCustom || isAdd) setTitle((prev) => prev || video.title);
                          if (isCustom || isAdd) setDurationMinutes(video.durationMinutes || 30);
                        }}
                      >
                        <p className="font-medium">{video.title}</p>
                        <p className={`mt-0.5 text-xs ${selected ? "opacity-80" : "text-slate-500"}`}>
                          {[video.subjectName, video.chapterName].filter(Boolean).join(" · ")} · {video.durationMinutes} min
                        </p>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {(isCustom || isAdd) && (
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Duration (minutes)</span>
                <input
                  type="number"
                  min={5}
                  max={240}
                  className="input mt-1.5"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />
              </label>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : isAdd ? "Add task" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MissionTaskEditorModal;
