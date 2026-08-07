/** Match client `sortSubjectContents` — used for reorder and merge playlists. */
export const sortSubjectContents = (items = [], chapters = []) => {
  const chapterOrder = new Map(
    (chapters || []).map((chapter, index) => [String(chapter._id || chapter.id), index])
  );

  return [...items].sort((a, b) => {
    const aSort = a.importSortOrder;
    const bSort = b.importSortOrder;
    if (aSort != null && bSort != null && aSort !== bSort) return aSort - bSort;
    if (aSort != null && bSort == null) return -1;
    if (aSort == null && bSort != null) return 1;

    const aMsg = Number(a.telegramMessageId) || 0;
    const bMsg = Number(b.telegramMessageId) || 0;
    if (aMsg && bMsg && aMsg !== bMsg) return aMsg - bMsg;

    const ca = chapterOrder.get(String(a.chapterId?._id || a.chapterId)) ?? 999;
    const cb = chapterOrder.get(String(b.chapterId?._id || b.chapterId)) ?? 999;
    if (ca !== cb) return ca - cb;
    return String(a.title).localeCompare(String(b.title));
  });
};
