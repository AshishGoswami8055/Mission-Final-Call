/**
 * CDS batches — disk folders under /uploads/<folder>/subjects/...
 * Active cycle is CDS (II) 2026. The cds-1-2026 mapping is kept only so any
 * legacy data on disk still resolves to its existing folder.
 */
export const DEFAULT_COURSE_ID = "cds-2-2026";
export const DEFAULT_UPLOAD_FOLDER = "CDS 2 2026";

export const COURSE_UPLOAD_FOLDERS = {
  "cds-1-2026": "CDS 1 2026",
  "cds-2-2026": "CDS 2 2026",
};

/**
 * Root folder name inside /uploads for this course (spaces allowed, Windows-safe).
 */
export function getUploadFolderForCourseId(courseId) {
  const id = String(courseId || "").trim();
  if (COURSE_UPLOAD_FOLDERS[id]) return COURSE_UPLOAD_FOLDERS[id];
  const m = id.match(/^cds-(\d+)-(\d{4})$/i);
  if (m) return `CDS ${m[1]} ${m[2]}`;
  return DEFAULT_UPLOAD_FOLDER;
}

export function getDistinctCourseUploadFolders() {
  return [...new Set(Object.values(COURSE_UPLOAD_FOLDERS))];
}

/** All CDS cycle ids (for seeding default coaching folders). */
export const CDS_CYCLE_IDS = Object.keys(COURSE_UPLOAD_FOLDERS);
