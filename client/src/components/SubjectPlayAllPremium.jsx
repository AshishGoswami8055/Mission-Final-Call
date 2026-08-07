import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiDownload, FiLoader, FiPlay, FiStar } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { getSubjectVideosForPlayAll } from "../utils/contentSort";
import { isLocalFrontend, isTelegramLinkVideo } from "../utils/media";
import {
  downloadSubjectMergeParts,
  downloadSubjectMergedVideo,
} from "../utils/subjectPlayAll";
import { pollSubjectSmoothPlayback, startSubjectSmoothPlayback } from "../utils/subjectDownload";

const SubjectPlayAllPremium = ({ subject, contents = [], chapters = [], disabled = false }) => {
  const navigate = useNavigate();
  const isLocal = isLocalFrontend();
  const [merging, setMerging] = useState(false);
  const [mergeMessage, setMergeMessage] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepareMessage, setPrepareMessage] = useState("");
  const [mergeStatus, setMergeStatus] = useState(null);

  const playableVideos = useMemo(() => {
    const sorted = getSubjectVideosForPlayAll(contents, chapters);
    return sorted.filter((row) => !isTelegramLinkVideo(row));
  }, [contents, chapters]);

  const canUse = playableVideos.length > 0 && !disabled;
  const partsTotal = mergeStatus?.partsTotal || playableVideos.length;
  const partsReady = mergeStatus?.partsReady ?? mergeStatus?.pcLibraryReady ?? 0;
  const allPartsReady = partsTotal > 0 && partsReady >= partsTotal;
  const mergedReady = Boolean(mergeStatus?.ready);

  const refreshMergeStatus = useCallback(async () => {
    if (!subject?._id) return;
    try {
      const { data } = await api.get(`/subjects/${subject._id}/merged-video`);
      setMergeStatus(data);
    } catch {
      /* ignore */
    }
  }, [subject?._id]);

  useEffect(() => {
    void refreshMergeStatus();
    if (!subject?._id || !isLocal) return undefined;
    const interval = setInterval(() => void refreshMergeStatus(), 8000);
    return () => clearInterval(interval);
  }, [subject?._id, isLocal, refreshMergeStatus, contents.length]);

  const handlePlayAll = () => {
    if (!canUse) return;
    navigate(`/subject/${subject._id}/full-video`, {
      state: {
        subjectName: subject.name,
        videoCount: playableVideos.length,
      },
    });
  };

  const handlePrepareChapters = async () => {
    if (!canUse || preparing || merging) return;
    setPreparing(true);
    setPrepareMessage("Starting…");

    try {
      if (isLocal) {
        await startSubjectSmoothPlayback(subject._id);
        await pollSubjectSmoothPlayback(subject._id, {
          onProgress: (status) => {
            const done = status.completed ?? 0;
            const total = status.total || partsTotal;
            setPrepareMessage(
              status.currentTitle
                ? `Saving to PC ${done}/${total} · ${status.currentTitle}`
                : `Saving to PC ${done}/${total}…`
            );
          },
        });
        await refreshMergeStatus();
        const { data: latest } = await api.get(`/subjects/${subject._id}/merged-video`);
        toast.success(
          latest?.partsComplete
            ? "All chapters ready — Play full course will stitch quickly"
            : `${latest?.partsReady ?? latest?.pcLibraryReady ?? 0}/${latest?.partsTotal ?? partsTotal} chapters ready`
        );
        return;
      }

      await downloadSubjectMergeParts(subject._id, {
        onProgress: (data) => {
          setPrepareMessage(data.message || "Downloading chapters…");
        },
      });
      await refreshMergeStatus();
      toast.success("All chapters downloaded — Play full course will stitch quickly");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not prepare chapters");
    } finally {
      setPreparing(false);
      setPrepareMessage("");
    }
  };

  const handleDownloadMerged = async () => {
    if (!canUse || merging) return;
    setMerging(true);
    setMergeMessage("Starting…");
    try {
      await downloadSubjectMergedVideo(subject._id, {
        onProgress: (data) => {
          setMergeMessage(data.message || "Building full course video…");
        },
      });
      toast.success("Full course video download started");
      await refreshMergeStatus();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not build full video");
    } finally {
      setMerging(false);
      setMergeMessage("");
    }
  };

  if (!playableVideos.length) return null;

  return (
    <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-violet-50 p-3 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:via-[#1a1a1a] dark:to-violet-950/20 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            <FiStar size={14} className="text-amber-500" />
            Premium · Full course video
          </p>
            {isLocal ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Use <strong>Download</strong> or <strong>Replace</strong> on each lesson to link videos from your PC.{" "}
              <strong>Play full course</strong> stitches them into one local file.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Downloads all chapters first, then stitches one file.
            </p>
          )}

          {isLocal && partsTotal > 0 ? (
            <p
              className={`mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                allPartsReady
                  ? "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                  : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
              }`}
            >
              {allPartsReady ? <FiCheck size={12} /> : null}
              {partsReady}/{partsTotal} chapters ready
              {mergedReady ? " · full course file ready" : allPartsReady ? " · ready to stitch" : ""}
            </p>
          ) : null}

          {(preparing && prepareMessage) || (merging && mergeMessage) ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {preparing ? prepareMessage : mergeMessage}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {!allPartsReady ? (
            <button
              type="button"
              className="btn-secondary w-full text-sm sm:w-auto"
              disabled={!canUse || preparing || merging}
              onClick={() => void handlePrepareChapters()}
            >
              {preparing ? <FiLoader size={14} className="animate-spin" /> : <FiDownload size={14} />}
            {isLocal ? "Download all to PC" : "Prepare chapters"}
          </button>
          ) : null}
          <button
            type="button"
            className="btn-primary w-full bg-gradient-to-r from-violet-600 to-teal-600 text-sm sm:w-auto"
            disabled={!canUse}
            onClick={handlePlayAll}
          >
            <FiPlay size={14} />
            Play full course
          </button>
          <button
            type="button"
            className="btn-secondary w-full text-sm sm:w-auto"
            disabled={!canUse || merging}
            onClick={handleDownloadMerged}
            title="Builds one MP4 file — can take a while"
          >
            {merging ? <FiLoader size={14} className="animate-spin" /> : <FiDownload size={14} />}
            Download full video
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubjectPlayAllPremium;
