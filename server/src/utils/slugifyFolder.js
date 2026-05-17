/** Safe single path segment for coaching batch folders (spaces → underscores). */
export const slugifyFolderName = (name = "") => {
  const s = String(name)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "Batch";
};
