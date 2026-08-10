import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  FiCheck,
  FiCheckCircle,
  FiCircle,
  FiFolder,
  FiLoader,
  FiPlay,
  FiRefreshCw,
  FiStar,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { getSubjectVideosForPlayAll } from "../utils/contentSort";
import { isLocalFrontend, isTelegramLinkVideo } from "../utils/media";
import {
  fetchFullCourseStatus,
  linkFullCourseFromPath,
  replaceFullCourseVideo,
  revealFullCourseVideo,
} from "../utils/subjectFullCourse";
import { formatFileSize } from "../utils/media";

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
  const [linkPath, setLinkPath] = useState("");
  const [linkingPath, setLinkingPath] = useState(false);

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
      toast.error("Link your full course MP4 first — use Link from path for large files.");
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
        toast("Use Link from path below for files over 8 GB — no upload needed.", { icon: "💡" });
      }
    } finally {
      setReplacing(false);
      setReplacePercent(0);
    }
  };

  const handleLinkFromPath = async () => {
    const trimmed = linkPath.trim();
    if (!trimmed || disabled || linkingPath) return;
    setLinkingPath(true);
    try {
      const { data } = await linkFullCourseFromPath(subject._id, trimmed);
      setFullCourseStatus(data);
      setLinkPath("");
      toast.success(data.message || "Linked your file — no upload needed.");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not link file from path");
    } finally {
      setLinkingPath(false);
    }
  };

  const handleToggleSubjectComplete = () => {
    if (!onToggleSubjectCompleted || disabled || togglingSubjectComplete) return;
    void onToggleSubjectCompleted(subject._id, subjectComplete);
  };

  if (!playableVideos.length) return null;

  return (
    <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-violet-50 p-3 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:via-[#1a1a1a] dark:to-violet-950/20 sm:p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mkv,.mov,.m4v"
        className="hidden"
        onChange={handleReplaceFile}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            <FiStar size={14} className="text-amber-500" />
            Premium · Full course video
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            For large files (8 GB+), paste the full Windows path below —{" "}
            <strong>Link from path</strong> registers instantly with no upload. Smaller files can use{" "}
            <strong>Replace full course</strong>.
          </p>

          {isLocal ? (
            <div className="mt-3 flex w-full max-w-2xl flex-col gap-2 sm:flex-row">
              <input
                type="text"
                className="input min-w-0 flex-1 py-2 text-sm"
                placeholder="C:\Videos\Indian geography full.mp4"
                value={linkPath}
                disabled={disabled || linkingPath}
                onChange={(event) => setLinkPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleLinkFromPath();
                }}
              />
              <button
                type="button"
                className="btn-secondary shrink-0 text-sm"
                disabled={!linkPath.trim() || disabled || linkingPath}
                onClick={() => void handleLinkFromPath()}
              >
                {linkingPath ? <FiLoader size={14} className="animate-spin" /> : null}
                Link from path
              </button>
            </div>
          ) : null}

          <p
            className={`mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
              fullCourseReady
                ? "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
            }`}
          >
            {fullCourseReady ? <FiCheck size={12} /> : null}
            {fullCourseReady
              ? `${fullCourseStatus?.originalFileName || "Full course linked"}${fullCourseStatus?.sizeBytes ? ` · ${formatFileSize(fullCourseStatus.sizeBytes)}` : ""}`
              : "No full course video linked yet"}
          </p>

          {onToggleSubjectCompleted && subjectLessons.length > 0 ? (
            <button
              type="button"
              className={`mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                subjectComplete
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:border-emerald-800/60"
              }`}
              disabled={disabled || togglingSubjectComplete}
              onClick={handleToggleSubjectComplete}
              title={
                subjectComplete
                  ? "Clear completion for all lessons in this subject"
                  : "Mark every lesson in this subject as complete (100%)"
              }
            >
              {togglingSubjectComplete ? (
                <FiLoader size={16} className="animate-spin" />
              ) : subjectComplete ? (
                <FiCheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <FiCircle size={16} />
              )}
              {subjectComplete
                ? `Subject complete (${completedLessons}/${subjectLessons.length})`
                : `Mark entire subject complete (${completedLessons}/${subjectLessons.length})`}
            </button>
          ) : null}

          {replacing && replacePercent > 0 ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Linking full course video {replacePercent}%…
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {isLocal ? (
            <>
              <button
                type="button"
                className="btn-secondary w-full text-sm sm:w-auto"
                disabled={!canUse || revealing}
                onClick={() => void handleRevealMerged()}
                title="Show the full course MP4 in File Explorer"
              >
                {revealing ? <FiLoader size={14} className="animate-spin" /> : <FiFolder size={14} />}
                Locate full course
              </button>
              <button
                type="button"
                className="btn-secondary w-full text-sm sm:w-auto"
                disabled={!canUse || replacing}
                onClick={handleReplaceClick}
                title="Pick your manually edited full course MP4 from your PC"
              >
                {replacing ? <FiLoader size={14} className="animate-spin" /> : <FiRefreshCw size={14} />}
                Replace full course
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="btn-primary w-full bg-gradient-to-r from-violet-600 to-teal-600 text-sm sm:w-auto"
            disabled={!canPlay}
            onClick={handlePlayAll}
            title={fullCourseReady ? "Play your linked full course video" : "Link a full course MP4 first"}
          >
            <FiPlay size={14} />
            Play full course
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubjectPlayAllPremium;
