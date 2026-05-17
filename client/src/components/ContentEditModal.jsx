import { useEffect, useMemo, useState } from "react";
import { getTelegramVideoUrl, isTelegramVideo } from "../utils/media";

const ContentEditModal = ({ content, subjects, chapters, onClose, onSubmit }) => {
  const [title, setTitle] = useState(content?.title || "");
  const [subjectId, setSubjectId] = useState(content?.subjectId?._id || content?.subjectId || "");
  const [chapterId, setChapterId] = useState(content?.chapterId?._id || content?.chapterId || "");
  const [videoUrl, setVideoUrl] = useState(getTelegramVideoUrl(content) || "");
  const [thumbnail, setThumbnail] = useState(content?.thumbnail || "");

  const isTelegram = isTelegramVideo(content);

  const chapterOptions = useMemo(
    () => chapters.filter((chapter) => chapter.subjectId === subjectId),
    [chapters, subjectId]
  );

  useEffect(() => {
    if (!chapterOptions.some((chapter) => chapter._id === chapterId)) {
      setChapterId(chapterOptions[0]?._id || "");
    }
  }, [chapterOptions, chapterId]);

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3 className="text-lg font-semibold">Edit Content</h3>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const payload = { title, subjectId, chapterId };
            if (isTelegram) {
              payload.videoUrl = videoUrl.trim();
              payload.thumbnail = thumbnail.trim() || null;
            }
            onSubmit(payload);
          }}
        >
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Content title"
            required
          />
          {isTelegram && (
            <>
              <input
                className="input"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Telegram video link (https://t.me/...)"
                required
              />
              <input
                className="input"
                value={thumbnail}
                onChange={(e) => setThumbnail(e.target.value)}
                placeholder="Optional thumbnail URL"
              />
              <p className="text-xs text-slate-500">
                This lesson plays from Telegram — no file is stored on the server. Students open this link to watch.
              </p>
            </>
          )}
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
            {subjects.map((subject) => (
              <option key={subject._id} value={subject._id}>
                {subject.name}
              </option>
            ))}
          </select>
          <select className="input" value={chapterId} onChange={(e) => setChapterId(e.target.value)} required>
            {chapterOptions.map((chapter) => (
              <option key={chapter._id} value={chapter._id}>
                {chapter.chapterName}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContentEditModal;
