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

/** Default study duration per slot when video metadata has no duration. */
export const SLOT_DEFAULT_MINUTES = {
  english: 45,
  maths: 60,
  gs: 50,
  reading: 60,
};

export const CORE_DAILY_SLOTS = ["english", "maths", "gs", "reading"];

/** App calendar timezone — CDS users are primarily in India. */
export const APP_TIMEZONE = "Asia/Kolkata";

export const todayDateKey = (date = new Date(), timeZone = APP_TIMEZONE) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));

/** Move a YYYY-MM-DD key by N calendar days in the app timezone. */
export const addDaysToDateKey = (dateKey, days, timeZone = APP_TIMEZONE) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return todayDateKey(anchor, timeZone);
};

/** UTC bounds for one app-calendar day (for session upserts). */
export const istDayBounds = (dateKey = todayDateKey()) => {
  const start = new Date(`${dateKey}T00:00:00+05:30`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

export const isSunday = (date = new Date()) => new Date(date).getDay() === 0;
