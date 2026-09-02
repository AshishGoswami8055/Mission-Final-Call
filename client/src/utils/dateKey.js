/** Match server calendar days (IST) for study time + streak. */
export const APP_TIMEZONE = "Asia/Kolkata";

export const getTodayDateKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
