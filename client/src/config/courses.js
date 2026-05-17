/**
 * Active CDS cycle is **CDS (II) 2026** — September written.
 * The cycle id is still namespaced so future seasons can be added without
 * breaking existing programmes/subjects on the server.
 */

const batch = (num, year, examMonthDay, badge) => {
  const id = `cds-${num}-${year}`;
  const cycle = num === 1 ? "April (I)" : "September (II)";
  return {
    id,
    title: `CDS (${num === 1 ? "I" : "II"}) ${year}`,
    subtitle: `Combined Defence Services · ${cycle} written`,
    examDate: `${year}-${examMonthDay}`,
    uploadFolderName: `CDS ${num} ${year}`,
    badge,
  };
};

/** Only CDS (II) 2026 is shown across the UI right now. */
export const COURSES = [batch(2, 2026, "09-13", "CDS 2 · 2026")].map((c) => ({
  ...c,
  accent: "indigo",
}));

/** Prep season window for the visual tracker. */
export const SEASON_START = new Date("2026-03-01T00:00:00");
export const SEASON_END = new Date("2026-09-13T23:59:59");

export const EXAM_MILESTONES = [
  { id: "cds-2-2026", label: "CDS (II) 26", date: new Date("2026-09-13T00:00:00") },
];

const DEFAULT_COURSE_ID = "cds-2-2026";

export function getCourseById(id) {
  return (
    COURSES.find((c) => c.id === id) ||
    COURSES.find((c) => c.id === DEFAULT_COURSE_ID) ||
    COURSES[0]
  );
}

export function courseExamDate(courseId) {
  const c = getCourseById(courseId);
  return new Date(`${c.examDate}T00:00:00`);
}

export function getNextMilestoneAfter(now = new Date()) {
  const n = new Date(now);
  n.setHours(0, 0, 0, 0);
  const sorted = [...EXAM_MILESTONES].sort((a, b) => a.date - b.date);
  for (const m of sorted) {
    const d0 = new Date(m.date);
    d0.setHours(0, 0, 0, 0);
    if (d0 >= n) return m;
  }
  return sorted[sorted.length - 1];
}

export function getDefaultCourseId() {
  return DEFAULT_COURSE_ID;
}
