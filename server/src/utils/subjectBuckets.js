/** Classify a subject name into CDS mission buckets. */
export const classifySubjectBucket = (name = "") => {
  const n = String(name).trim().toUpperCase();
  if (!n) return null;
  if (/ENGLISH/.test(n)) return "english";
  if (/MATH/.test(n)) return "maths";
  if (
    /GK|GS|GENERAL\s*(STUDIES|KNOWLEDGE)|HISTORY|GEOGRAPHY|POLITY|SCIENCE|ECONOMY|CURRENT|PHYSICS|CHEMISTRY|BIOLOGY/.test(
      n
    )
  ) {
    return "gs";
  }
  return null;
};

export const MISSION_VIDEO_SLOTS = ["english", "maths", "gs"];
export const DEFAULT_READING_TARGET_MINUTES = 60;

export const todayDateKey = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

export const isSunday = (date = new Date()) => new Date(date).getDay() === 0;
