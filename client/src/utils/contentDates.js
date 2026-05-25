/** Items count as "new" for this many days after import. */
export const NEW_CONTENT_DAYS = 2;

/** Format a content date for list display (e.g. "12 Mar 2026"). */
export const formatContentDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** True when the item was added to the app within the last N days. */
export const isRecentlyAddedContent = (createdAt, withinDays = NEW_CONTENT_DAYS) => {
  if (!createdAt) return false;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return false;
  const ms = Date.now() - date.getTime();
  return ms >= 0 && ms <= withinDays * 24 * 60 * 60 * 1000;
};

/**
 * Original post date (Telegram) vs when it was imported into the app.
 * uploadedAt = Telegram post / file date; createdAt = import time in MongoDB.
 */
export const getContentDateLabels = (item) => {
  const posted = formatContentDate(item?.uploadedAt);
  const added = formatContentDate(item?.createdAt);
  const isNew = isRecentlyAddedContent(item?.createdAt);

  return { posted, added, isNew };
};

export const filterRecentlyAdded = (items, withinDays = NEW_CONTENT_DAYS) =>
  items.filter((item) => isRecentlyAddedContent(item?.createdAt, withinDays));
