/** Parse bot-style caption blocks (Index, Title, Topic, Batch). */
export const parseTelegramCaptionMetadata = (text = "") => {
  const out = {};
  if (!text) return out;
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*(Index|Title|Topic|Batch)\s*:\s*(.+)$/i);
    if (match) out[match[1].toLowerCase()] = match[2].trim();
  }
  return out;
};

/** Stable virtual topic id for flat channels (avoids real Telegram topic id range). */
export const subjectKeyToVirtualTopicId = (subjectKey = "") => {
  const key = String(subjectKey || "general").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return 900_000_000 + (Math.abs(hash) % 99_999_999);
};

export const inferFlatChannelSubjectKey = (meta = {}) => {
  const fields = parseTelegramCaptionMetadata(meta.caption);

  if (fields.topic) {
    const topic = fields.topic.trim();
    if (topic.includes(" - ")) {
      const parts = topic.split(/\s+-\s+/);
      const tail = parts[parts.length - 1]?.trim();
      if (tail) return tail;
    }
    const keywordMatch = topic.match(
      /^(GK|ENGLISH|MATH|REASONING|SCIENCE|HISTORY|GEOGRAPHY|POLITY|ECONOMICS)\b/i
    );
    if (keywordMatch) return keywordMatch[1].toUpperCase();
    return topic;
  }

  if (fields.batch) return fields.batch.trim();

  const base = String(meta.fileName || "").replace(/\.[^.]+$/, "");
  const parts = base.split(/[-–—_|/\\]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[0];

  return "General";
};

export const resolveFlatChannelLessonTitle = (meta = {}) => {
  const fields = parseTelegramCaptionMetadata(meta.caption);
  if (fields.title) return fields.title.trim();
  return meta.displayName || meta.fileName || "Lesson";
};
