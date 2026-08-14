import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  FiCheck,
  FiCheckCircle,
  FiCircle,
  FiFilm,
  FiFolder,
  FiLoader,
  FiPlay,
  FiStar,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { getSubjectVideosForPlayAll } from "../utils/contentSort";
import { formatFileSize, isLocalFrontend, isTelegramLinkVideo } from "../utils/media";
import {
  fetchFullCourseStatus,
  pickFullCourseVideo,
  replaceFullCourseVideo,
  revealFullCourseVideo,
} from "../utils/subjectFullCourse";

const SubjectPlayAllPremium = ({
  subject,
  contents = [],
  chapters = [],
  disabled = false,
  onToggleSubjectCompleted,
  togglingSubjectComplete = false,
}) => {
  const navigate = useNavigate();
  const isLocal = isLocalFrontend();
  const fileInputRef = useRef(null);
  const [fullCourseStatus, setFullCourseStatus] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replacePercent, setReplacePercent] = useState(0);
  const [pickingVideo, setPickingVideo] = useState(false);

  const playableVideos = useMemo(() => {
    const sorted = getSubjectVideosForPlayAll(contents, chapters);
    return sorted.filter((row) => !isTelegramLinkVideo(row));
  }, [contents, chapters]);

  const fullCourseReady = Boolean(fullCourseStatus?.ready);
  const canUse = playableVideos.length > 0 && !disabled;
  const canPlay = canUse && fullCourseReady;

  const subjectLessons = useMemo(
    () => contents.filter((item) => item.type === "video" || item.type === "pdf"),
    [contents]
  );
  const completedLessons = useMemo(
    () => subjectLessons.filter((item) => item.completed).length,
    [subjectLessons]
  );
  const subjectComplete =
    subjectLessons.length > 0 && completedLessons === subjectLessons.length;

  const refreshFullCourseStatus = useCallback(async () => {
    if (!subject?._id) return;
    try {
      const { data } = await fetchFullCourseStatus(subject._id);
      setFullCourseStatus(data);
    } catch {
      /* ignore */
    }
  }, [subject?._id]);

  useEffect(() => {
    void refreshFullCourseStatus();
    if (!subject?._id || !isLocal) return undefined;
    const interval = setInterval(() => void refreshFullCourseStatus(), 8000);
    return () => clearInterval(interval);
  }, [subject?._id, isLocal, refreshFullCourseStatus, contents.length]);

  const handlePlayAll = () => {
    if (!canPlay) {
      toast.error("Choose your full course MP4 first.");
      return;
    }
    navigate(`/subject/${subject._id}/full-video`, {
      state: {
        subjectName: subject.name,
        videoCount: playableVideos.length,
      },
    });
  };

  const handleRevealMerged = async () => {
    if (!canUse || revealing) return;
    setRevealing(true);
    try {
      const { data } = await revealFullCourseVideo(subject._id);
      toast.success(data.message || "Opened in File Explorer");
      await refreshFullCourseStatus();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not open file location");
    } finally {
      setRevealing(false);
    }
  };

  const handleReplaceClick = () => {
    if (disabled || replacing) return;
    fileInputRef.current?.click();
  };

  const handleReplaceFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled || replacing) return;

    setReplacing(true);
    setReplacePercent(0);
    try {
      const { data } = await replaceFullCourseVideo(subject._id, file, {
        onUploadProgress: setReplacePercent,
      });
      setFullCourseStatus(data);
      toast.success(`Linked "${file.name}" as the full course video.`);
    } catch (error) {
      const message = error.response?.data?.message || error.message || "Could not link full course video";
      toast.error(message);
      if (/too large|limit/i.test(message)) {
        toast("Use Choose video from PC for files over 8 GB — no upload needed.", { icon: "💡" });
      }
    } finally {
      setReplacing(false);
      setReplacePercent(0);
    }
  };

  const handlePickVideo = async () => {
    if (disabled || pickingVideo) return;
    setPickingVideo(true);
    try {
      toast("Select your video in the file picker…", { icon: "📂", duration: 4000 });
      const { data } = await pickFullCourseVideo(subject._id);
      if (data.cancelled) return;
      setFullCourseStatus(data);
      toast.success(data.message || "Full course video linked from your PC.");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not link video from PC");
    } finally {
      setPickingVideo(false);
    }
  };

  const handleToggleSubjectComplete = () => {
    if (!onToggleSubjectCompleted || disabled || togglingSubjectComplete) return;
    void onToggleSubjectCompleted(subject._id, subjectComplete);
  };

  if (!playableVideos.length) return null;

  const title = fullCourseReady ? "Ready to play" : "Full course video";
  const subtitle = fullCourseReady
    ? [
        fullCourseStatus?.originalFileName || "Linked",
        fullCourseStatus?.sizeBytes ? formatFileSize(fullCourseStatus.sizeBytes) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Choose your edited MP4 — works with 20 GB+ files, no upload.";

  return (
    <section
      className={`rounded-2xl border shadow-sm ${
        fullCourseReady
          ? "border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-teal-50/60 dark:border-violet-900/40 dark:from-violet-950/30 dark:via-[#181818] dark:to-teal-950/20"
          : "border-slate-200/90 bg-gradient-to-br from-slate-50/90 via-white to-indigo-50/30 dark:border-white/10 dark:from-white/[0.04] dark:via-[#181818] dark:to-indigo-950/15"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mkv,.mov,.m4v"
        className="hidden"
        onChange={handleReplaceFile}
      />

      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-md ${
              fullCourseReady
                ? "bg-gradient-to-br from-violet-600 to-teal-600 text-white"
                : "bg-gradient-to-br from-slate-700 to-slate-900 text-white dark:from-slate-600 dark:to-slate-800"
            }`}
          >
            {fullCourseReady ? <FiFilm size={20} /> : <FiPlay size={18} className="ml-0.5" />}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              <FiStar size={12} className="text-amber-500" />
              Full course
            </p>
            <p className="flex items-center gap-1.5 text-base font-semibold text-slate-900 dark:text-white">
              {title}
              {fullCourseReady ? (
                <FiCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
              ) : null}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-400" title={subtitle}>
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {onToggleSubjectCompleted && subjectLessons.length > 0 ? (
            <button
              type="button"
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                subjectComplete
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
              }`}
              disabled={disabled || togglingSubjectComplete}
              onClick={handleToggleSubjectComplete}
              title={
                subjectComplete
                  ? "Clear completion for all lessons"
                  : "Mark every lesson complete"
              }
            >
              {togglingSubjectComplete ? (
                <FiLoader size={15} className="animate-spin" />
              ) : subjectComplete ? (
                <FiCheckCircle size={15} />
              ) : (
                <FiCircle size={15} />
              )}
              <span className="hidden sm:inline">
                {subjectComplete ? "Subject complete" : "Mark all complete"}
              </span>
              <span className="tabular-nums">({completedLessons}/{subjectLessons.length})</span>
            </button>
          ) : null}

          {isLocal ? (
            <>
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-sm"
                disabled={!canUse || disabled || pickingVideo || replacing}
                onClick={() => void handlePickVideo()}
                title="Open file picker — links instantly, no upload"
              >
                {pickingVideo ? <FiLoader size={15} className="animate-spin" /> : <FiFolder size={15} />}
                Choose video
              </button>
              {!fullCourseReady ? (
                <button
                  type="button"
                  className="btn-secondary px-3 py-2 text-sm"
                  disabled={disabled || replacing || pickingVideo}
                  onClick={handleReplaceClick}
                  title="Upload under 8 GB"
                >
                  Upload
                </button>
              ) : null}
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-sm"
                disabled={!canUse || revealing}
                onClick={() => void handleRevealMerged()}
                title="Show in File Explorer"
              >
                {revealing ? <FiLoader size={15} className="animate-spin" /> : <FiFolder size={15} />}
                Locate
              </button>
            </>
          ) : null}

          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold shadow-sm transition ${
              canPlay
                ? "bg-gradient-to-r from-violet-600 via-indigo-600 to-teal-600 text-white hover:brightness-105 active:scale-[0.98]"
                : "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-500"
            }`}
            disabled={!canPlay}
            onClick={handlePlayAll}
            title={fullCourseReady ? "Play full course" : "Link a video first"}
          >
            <FiPlay size={15} className={canPlay ? "fill-current" : ""} />
            Play full course
          </button>
        </div>
      </div>

      {replacing && replacePercent > 0 ? (
        <div className="border-t border-slate-200/70 px-3.5 pb-3 pt-2 dark:border-white/[0.06] sm:px-4">
          <div className="flex items-center justify-between text-xs font-medium text-violet-700 dark:text-violet-300">
            <span>Uploading…</span>
            <span>{replacePercent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-teal-500 transition-all duration-300"
              style={{ width: `${replacePercent}%` }}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default SubjectPlayAllPremium;
