import { useEffect, useState } from "react";
import { FiEdit2, FiPlus, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import api from "../../api/client";
import MissionVideoPicker from "./MissionVideoPicker";

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
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target?.contentId) return;
    let cancelled = false;
    const loadSelected = async () => {
      try {
        const { data } = await api.get(`/contents/${target.contentId}`);
        if (!cancelled && data) {
          setSelectedVideo({
            ...data,
            subjectName: data.subjectId?.name || "",
            chapterName: data.chapterId?.chapterName || "",
            durationMinutes: data.duration
              ? Math.max(1, Math.round(Number(data.duration) / 60))
              : 45,
          });
        }
      } catch {
        /* ignore — picker will show empty selection */
      }
    };
    loadSelected();
    return () => {
      cancelled = true;
    };
  }, [target?.contentId]);

  const handleVideoSelect = (video) => {
    setSelectedVideo(video);
    if (isCustom || isAdd) {
      setTitle((prev) => prev || video.title);
      setDurationMinutes(video.durationMinutes || 30);
    }
  };

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
  const slotShortLabel = SLOT_LABELS[slotKey]?.replace(" video", "").replace(" session", "") || "Task";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card modal-card-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/10">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
              <HeaderIcon size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">{modalTitle}</h2>
                {slotKey && (
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SLOT_ACCENT[slotKey] || SLOT_ACCENT.custom}`}
                  >
                    {slotShortLabel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {isReading
                  ? "Set how long you want to read today."
                  : isVideoSlot
                    ? "Browse subjects like the dashboard and pick any video from your library."
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
                <MissionVideoPicker
                  selectedVideo={selectedVideo}
                  onSelect={handleVideoSelect}
                  slotLabel={isVideoSlot ? slotShortLabel : null}
                />
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
