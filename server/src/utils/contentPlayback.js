/** Shared rules for Telegram stream / playable content (server-side). */
export const isTelegramStreamContent = (item) =>
  Boolean(
    item?.telegramMessageId &&
    item?.telegramChannelId &&
    item?.type === "video" &&
    item?.sourceType !== "cloudinary" &&
    item?.sourceType !== "upload" &&
    (item.sourceType === "telegram" || item.telegramSource === true)
  );

export const formatBytesLabel = (bytes = 0) => {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
