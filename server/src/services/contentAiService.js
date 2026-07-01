import OpenAI from "openai";
import Content from "../models/Content.js";
import ContentAiCache from "../models/ContentAiCache.js";

const DEFAULT_MODEL = () => process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini";

export const isVideoAiEnabled = () => Boolean(process.env.OPENAI_API_KEY);

const loadVideoContent = async (contentId) => {
  const content = await Content.findById(contentId)
    .populate("subjectId", "name")
    .populate("chapterId", "chapterName")
    .lean();
  if (!content) throw new Error("Content not found");
  if (content.type !== "video") throw new Error("AI features are only available for video lessons");
  return content;
};

const buildContextBlock = (content) => {
  const subject = content.subjectId?.name || "Unknown subject";
  const chapter = content.chapterId?.chapterName || "Unknown chapter";
  const durationMin =
    content.duration && Number(content.duration) > 0
      ? `${Math.round(Number(content.duration) / 60)} minutes`
      : "unknown duration";
  return [
    `Title: ${content.title}`,
    `Subject: ${subject}`,
    `Chapter: ${chapter}`,
    `Duration: ${durationMin}`,
    `Source: ${content.sourceType || "unknown"}`,
  ].join("\n");
};

const formatOverviewResponse = (doc) => ({
  ready: Boolean(doc?.shortSummary),
  shortSummary: doc?.shortSummary || "",
  keyMoments: Array.isArray(doc?.keyMoments) ? doc.keyMoments : [],
  updatedAt: doc?.updatedAt || null,
});

export const getVideoAiOverview = async (contentId) => {
  if (!isVideoAiEnabled()) {
    return { ready: false, shortSummary: "", keyMoments: [], disabled: true };
  }
  await loadVideoContent(contentId);
  const cached = await ContentAiCache.findOne({ contentId }).lean();
  return formatOverviewResponse(cached);
};

export const refreshVideoAiOverview = async (contentId) => {
  if (!isVideoAiEnabled()) {
    throw new Error("OPENAI_API_KEY is not configured on the server");
  }
  const content = await loadVideoContent(contentId);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const context = buildContextBlock(content);

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You help CDS/UPSC aspirants study video lectures. Return JSON: { shortSummary: string (2-4 sentences), keyMoments: [{ label, timecode }] }. Use plausible timecodes (MM:SS) spread across the lesson based on title/chapter. English only.",
      },
      {
        role: "user",
        content: `Generate a study overview for this video lesson:\n${context}`,
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("AI returned an empty response");

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, ""));
  } catch {
    throw new Error("AI response was not valid JSON");
  }

  const doc = await ContentAiCache.findOneAndUpdate(
    { contentId },
    {
      shortSummary: String(parsed.shortSummary || "").trim(),
      keyMoments: Array.isArray(parsed.keyMoments)
        ? parsed.keyMoments.slice(0, 8).map((m) => ({
            label: String(m.label || "").trim(),
            timecode: String(m.timecode || "").trim(),
          }))
        : [],
      contextNotes: context,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return formatOverviewResponse(doc);
};

export const askVideoQuestion = async (contentId, { question, history = [] }) => {
  if (!isVideoAiEnabled()) {
    throw new Error("OPENAI_API_KEY is not configured on the server");
  }
  const trimmed = String(question || "").trim();
  if (!trimmed) throw new Error("Question is required");

  const content = await loadVideoContent(contentId);
  let cache = await ContentAiCache.findOne({ contentId }).lean();
  if (!cache?.shortSummary) {
    await refreshVideoAiOverview(contentId);
    cache = await ContentAiCache.findOne({ contentId }).lean();
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const messages = [
    {
      role: "system",
      content:
        "You are a CDS/UPSC study assistant. Answer from the lesson context below. If the transcript is not available, infer carefully from title/chapter/summary and say when you are estimating. Be concise and exam-focused.",
    },
    {
      role: "user",
      content: [
        cache?.contextNotes || buildContextBlock(content),
        cache?.shortSummary ? `Summary: ${cache.shortSummary}` : "",
        cache?.keyMoments?.length
          ? `Key moments: ${cache.keyMoments.map((m) => `${m.timecode} ${m.label}`).join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  for (const entry of history.slice(-6)) {
    const role = entry?.role === "assistant" ? "assistant" : "user";
    const text = String(entry?.text || "").trim();
    if (text) messages.push({ role, content: text });
  }

  messages.push({ role: "user", content: trimmed });

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL(),
    temperature: 0.3,
    messages,
  });

  const answer = completion.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("AI returned an empty answer");
  return { answer };
};
