export const suggestLessonTitle = (item) => {
  let name = String(item?.displayName || item?.fileName || "Lesson").trim();
  name = name.replace(/\.(mp4|mkv|webm|mov|m4v|pdf)$/i, "");
  name = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return name || "Lesson";
};

export const mediaMatchesImportPrefs = (item, prefs) =>
  (item?.mediaType === "video" && prefs?.includeVideos) ||
  (item?.mediaType === "pdf" && prefs?.includePdfs);

export const syncLessonPlanForTopic = (media = [], prefs, prevPlan = null) => {
  const eligible = media.filter((m) => !m.imported && mediaMatchesImportPrefs(m, prefs));
  const eligibleIds = new Set(eligible.map((m) => m.messageId));

  let order = (prevPlan?.order || []).filter((id) => eligibleIds.has(Number(id)));
  const orderSet = new Set(order.map(Number));
  const newIds = eligible
    .map((m) => m.messageId)
    .filter((id) => !orderSet.has(Number(id)))
    .sort((a, b) => a - b);
  order = [...order, ...newIds];

  const entries = { ...(prevPlan?.entries || {}) };
  for (const item of eligible) {
    const id = item.messageId;
    if (!entries[id]) {
      entries[id] = { selected: true, displayName: suggestLessonTitle(item) };
    }
  }
  for (const rawId of Object.keys(entries)) {
    if (!eligibleIds.has(Number(rawId))) {
      delete entries[rawId];
    }
  }

  return { order, entries };
};

export const countSelectedLessonsInPlan = (plan) => {
  if (!plan?.order?.length) return 0;
  return plan.order.filter((id) => plan.entries[id]?.selected).length;
};

export const buildSelectedItemsFromPlans = (topicIds, previewTopics, topicLessonPlans, topicKeyFn) => {
  const items = [];
  for (const topicId of topicIds) {
    const topic = previewTopics?.find((row) => row.id === topicId);
    if (!topic?.mediaLoaded) continue;
    const plan = topicLessonPlans[topicKeyFn(topicId)];
    if (!plan?.order?.length) continue;
    const mediaById = new Map((topic.media || []).map((row) => [row.messageId, row]));
    for (const messageId of plan.order) {
      const entry = plan.entries[messageId];
      if (!entry?.selected) continue;
      const meta = mediaById.get(messageId);
      items.push({
        topicId,
        messageId,
        topicTitle: topic.title,
        displayName: String(entry.displayName || "").trim() || suggestLessonTitle(meta),
      });
    }
  }
  return items;
};

export const orderedMediaForTopic = ({ media = [], plan, prefs, mediaFilter = "all" }) => {
  const mediaById = new Map(media.map((row) => [row.messageId, row]));
  let rows = plan?.order?.length
    ? plan.order.map((id) => mediaById.get(id)).filter(Boolean)
    : [...media];

  rows = rows.filter((row) => mediaMatchesImportPrefs(row, prefs));
  if (mediaFilter === "video") rows = rows.filter((row) => row.mediaType === "video");
  if (mediaFilter === "pdf") rows = rows.filter((row) => row.mediaType === "pdf");
  return rows;
};
