import { useEffect, useMemo, useState } from "react";
import UploadProgress from "./UploadProgress";
import { isLocalFrontend } from "../utils/media";

const ContentModal = ({
  subjects,
  chapters,
  selectedSubjectId,
  selectedChapterId,
  onClose,
  onSubmit,
  uploadState,
}) => {
  const isLocal = isLocalFrontend();
  const [title, setTitle] = useState("");
  const [titlePrefix, setTitlePrefix] = useState("");
  const [subjectId, setSubjectId] = useState(selectedSubjectId || subjects[0]?._id || "");
  const [chapterId, setChapterId] = useState(selectedChapterId || "");
  /** Local dev: upload | url | youtube_download. Production: telegram_video | upload_pdf | url_pdf */
  const [sourceType, setSourceType] = useState(() => (isLocalFrontend() ? "upload" : "telegram_video"));
  const [files, setFiles] = useState([]);
  const [url, setUrl] = useState("");
  const [telegramThumbnail, setTelegramThumbnail] = useState("");
  const [autoCreateChapters, setAutoCreateChapters] = useState(true);

  const chapterOptions = useMemo(
    () => chapters.filter((chapter) => chapter.subjectId === subjectId),
    [chapters, subjectId]
  );

  const isTelegramMode = sourceType === "telegram_video";
  const useAutoChapters =
    autoCreateChapters && ((isLocal && sourceType === "upload") || isTelegramMode);

  useEffect(() => {
    if (useAutoChapters) return;
    if (!chapterOptions.some((c) => c._id === chapterId)) {
      setChapterId(chapterOptions[0]?._id || "");
    }
  }, [chapterOptions, chapterId, useAutoChapters]);

  const submitForm = (e) => {
    e.preventDefault();
    if (isTelegramMode) {
      onSubmit({
        subjectId,
        chapterId: useAutoChapters ? "" : chapterId,
        sourceType: "url",
        videoSourceType: "telegram",
        title: title.trim(),
        telegramUrl: url.trim(),
        thumbnail: telegramThumbnail.trim() || undefined,
        autoCreateChapters: useAutoChapters,
        files: [],
        flow: "telegram",
      });
      return;
    }
    if (!isLocal) {
      if (sourceType === "upload_pdf") {
        onSubmit({
          titlePrefix,
          subjectId,
          chapterId,
          sourceType: "upload",
          files,
          url: "",
          flow: "upload_pdf",
        });
        return;
      }
      if (sourceType === "url_pdf") {
        onSubmit({
          subjectId,
          chapterId,
          sourceType: "url",
          title: title.trim(),
          url: url.trim(),
          files: [],
          flow: "url_pdf",
        });
      }
      return;
    }

    onSubmit({
      title,
      titlePrefix,
      subjectId,
      chapterId: useAutoChapters ? "" : chapterId,
      sourceType,
      files,
      url,
      autoCreateChapters: useAutoChapters,
      flow: "local_dev",
    });
  };

  const uploadProgressVariant = isLocal && sourceType === "youtube_download" ? "youtube" : "upload";

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3 className="text-lg font-semibold">Add Content</h3>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {isLocal
            ? "Upload videos to /uploads for local playback, or choose Telegram video link to store a t.me URL (no file upload)."
            : "On the live site, lesson videos use Telegram links only. PDFs still upload or link as before."}
        </p>
        <form className="mt-4 space-y-3" onSubmit={submitForm}>
          {isLocal && (sourceType === "url" || sourceType === "youtube_download") && (
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                sourceType === "youtube_download"
                  ? "Optional title (auto-filled from YouTube if blank)"
                  : "Content title"
              }
              required={sourceType === "url"}
            />
          )}
          {isLocal && sourceType === "upload" && (
            <input
              className="input"
              value={titlePrefix}
              onChange={(e) => setTitlePrefix(e.target.value)}
              placeholder="Optional title prefix (e.g. Indian Geography)"
            />
          )}

          {isTelegramMode && (
            <>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Lecture title (also used as chapter name)"
                required
              />
              <input
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Telegram video link (https://t.me/... or https://telegram.me/...)"
                required
              />
              <input
                className="input"
                value={telegramThumbnail}
                onChange={(e) => setTelegramThumbnail(e.target.value)}
                placeholder="Optional thumbnail URL (e.g. Cloudinary image URL)"
              />
              <p className="text-xs text-slate-500">
                No file is uploaded. The link is saved in <code className="text-[10px]">videoUrl</code> and opens in
                Telegram when students click the lesson.
              </p>
            </>
          )}

          {!isLocal && sourceType === "url_pdf" && (
            <>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="PDF title"
                required
              />
              <input
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Direct link to PDF file"
                required
              />
            </>
          )}

          {!isLocal && sourceType === "upload_pdf" && (
            <input
              className="input"
              value={titlePrefix}
              onChange={(e) => setTitlePrefix(e.target.value)}
              placeholder="Optional title prefix (e.g. Indian Geography)"
            />
          )}

          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
            {subjects.map((subject) => (
              <option key={subject._id} value={subject._id}>
                {subject.name}
              </option>
            ))}
          </select>

          {(useAutoChapters || (isLocal && sourceType === "upload") || isTelegramMode) && (
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/60">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={autoCreateChapters}
                onChange={(e) => setAutoCreateChapters(e.target.checked)}
              />
              <span className="text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-800 dark:text-slate-100">Auto-create chapters from filenames</span>
                <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                  {isTelegramMode
                    ? "The lecture title becomes the chapter name under the selected subject."
                    : "Each video becomes its own chapter. Names like BUDDHISM AND JAINISM 2025-12-16.mkv become chapter BUDDHISM AND JAINISM (date stripped)."}
                </span>
              </span>
            </label>
          )}

          {!useAutoChapters ? (
            <select className="input" value={chapterId} onChange={(e) => setChapterId(e.target.value)} required>
              {chapterOptions.map((chapter) => (
                <option key={chapter._id} value={chapter._id}>
                  {chapter.chapterName}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              {isTelegramMode
                ? "A chapter will be created from the lecture title."
                : "Chapter will be created automatically for each video from its filename."}
            </p>
          )}

          {isLocal ? (
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={sourceType === "upload"}
                  onChange={() => setSourceType("upload")}
                />
                Upload file
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={sourceType === "telegram_video"}
                  onChange={() => setSourceType("telegram_video")}
                />
                Telegram video link
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={sourceType === "url"} onChange={() => setSourceType("url")} />
                URL
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={sourceType === "youtube_download"}
                  onChange={() => setSourceType("youtube_download")}
                />
                YouTube Direct Download
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={sourceType === "telegram_video"}
                  onChange={() => setSourceType("telegram_video")}
                />
                Telegram video link
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={sourceType === "upload_pdf"}
                  onChange={() => setSourceType("upload_pdf")}
                />
                Upload PDF
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={sourceType === "url_pdf"} onChange={() => setSourceType("url_pdf")} />
                PDF from URL
              </label>
            </div>
          )}

          {isLocal && sourceType === "upload" ? (
            <div className="space-y-2">
              <input
                className="input"
                type="file"
                multiple
                accept="video/*,application/pdf"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                required
              />
              {!!files.length && (
                <p className="text-xs text-slate-500">
                  {files.length} file(s) selected.
                  {useAutoChapters
                    ? " One chapter per video will be created under the subject above."
                    : " Videos are saved under /uploads on the API server (localhost development)."}
                </p>
              )}
            </div>
          ) : null}

          {!isLocal && sourceType === "upload_pdf" ? (
            <div className="space-y-2">
              <input
                className="input"
                type="file"
                multiple
                accept="application/pdf"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                required
              />
              {!!files.length && (
                <p className="text-xs text-slate-500">{files.length} PDF file(s) selected.</p>
              )}
            </div>
          ) : null}

          {isLocal && (sourceType === "url" || sourceType === "youtube_download") ? (
            <input
              className="input"
              placeholder={
                sourceType === "youtube_download"
                  ? "Paste YouTube URL (best available up to Full HD)"
                  : "Paste YouTube/direct video/PDF URL"
              }
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          ) : null}

          {isLocal && sourceType === "youtube_download" && (
            <p className="text-xs text-slate-500">
              The server downloads from YouTube and stores the file in Cloudinary (requires{" "}
              <code className="text-[10px]">NODE_ENV</code> not production on the API).
            </p>
          )}

          {uploadState?.active && <UploadProgress state={uploadState} variant={uploadProgressVariant} />}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={uploadState?.active}>
              {uploadState?.active ? "Working in background" : "Cancel"}
            </button>
            <button type="submit" className="btn-primary" disabled={uploadState?.active}>
              {uploadState?.active
                ? uploadState.phase === "downloading"
                  ? "Fetching…"
                  : uploadState.phase === "finalizing"
                    ? "Finalizing…"
                    : uploadState.phase === "done"
                      ? "Done"
                      : isLocal && sourceType === "youtube_download"
                        ? "Downloading…"
                        : "Uploading…"
                : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContentModal;
