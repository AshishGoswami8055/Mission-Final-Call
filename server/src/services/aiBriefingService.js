import OpenAI from "openai";
import DailyMission from "../models/DailyMission.js";
import { todayDateKey } from "../utils/subjectBuckets.js";

const DEFAULT_MODEL = "gpt-4o-mini";

const REASON_COPY = {
  unwatched: "not started yet — highest priority",
  weak_subject: "weak area — needs focused attention",
  backlog: "pending from earlier — clear the backlog today",
  revision: "revision slot — strengthen retention",
  default: "part of today's balanced plan",
  sunday_mock: "weekly mock test",
};

const buildRuleBasedBriefing = ({ userName, dailyTarget, overview, mission }) => {
  const firstName = String(userName || "Cadet").trim().split(/\s+/)[0];
  const targets = dailyTarget?.targets || [];
  const progress = dailyTarget?.progressPercent ?? 0;
  const daysLeft = overview?.examCountdownDays ?? null;
  const weakest = overview?.weakestSubjects || [];
  const strongest = overview?.strongestSubjects || [];

  const priorities = targets.map((t) => ({
    slot: t.slot,
    subject: t.subjectName || t.label,
    lesson: t.title || t.label,
    duration: t.minutesLabel,
    why: REASON_COPY[mission?.items?.find((i) => i.slot === t.slot)?.reason] || REASON_COPY.default,
    completed: t.completed,
  }));

  const focusSlot = priorities.find((p) => !p.completed && p.slot === "maths")
    || priorities.find((p) => !p.completed)
    || priorities[0];

  const headline = focusSlot
    ? `Prioritize ${focusSlot.subject} today`
    : "Stay consistent — your daily plan is set";

  const summaryParts = [
    `${firstName}, your CDS prep plan balances English, Maths, GS, and 1 hour of reading.`,
    progress > 0
      ? `You are ${progress}% through today's ${dailyTarget?.totalGoalLabel || "study"} target.`
      : `Today's total goal is ${dailyTarget?.totalGoalLabel || "—"} across 3 videos plus reading.`,
  ];
  if (weakest.length) summaryParts.push(`Weakest areas right now: ${weakest.slice(0, 2).join(", ")}.`);
  if (daysLeft != null) summaryParts.push(`${daysLeft} days remain until CDS (II) 2026.`);

  return {
    headline,
    summary: summaryParts.join(" "),
    priorities,
    focusAreas: weakest.slice(0, 3),
    strengths: strongest.slice(0, 2),
    studyTip:
      progress >= 75
        ? "Finish strong with the reading hour — consolidation beats cramming."
        : "Start with your first video within 30 minutes to lock in momentum.",
    examCountdownDays: daysLeft,
    source: "rules",
    generatedAt: new Date().toISOString(),
  };
};

const buildAiPrompt = ({ userName, dailyTarget, overview, mission }) => {
  const targets = dailyTarget?.targets || [];
  const ctx = {
    cadet: userName,
    date: todayDateKey(),
    examDaysLeft: overview?.examCountdownDays,
    progressPercent: dailyTarget?.progressPercent,
    totalGoal: dailyTarget?.totalGoalLabel,
    streak: overview?.streak,
    weakestSubjects: overview?.weakestSubjects,
    strongestSubjects: overview?.strongestSubjects,
    todayPlan: targets.map((t) => ({
      slot: t.slot,
      label: t.label,
      lesson: t.title,
      subject: t.subjectName,
      chapter: t.chapterName,
      duration: t.minutesLabel,
      completed: t.completed,
      reason: mission?.items?.find((i) => i.slot === t.slot)?.reason,
    })),
  };

  return {
    system: `You are an expert CDS (Combined Defence Services) OTA preparation coach. Write concise, professional, motivating daily study guidance for one student. Be specific about which subject to study and why. No fluff. Return JSON only.`,
    user: `Generate today's AI study briefing from this data:
${JSON.stringify(ctx, null, 2)}

Return JSON:
{
  "headline": "short punchy title (max 8 words)",
  "summary": "2-3 sentences: what to study today and why, personalized",
  "priorities": [
    { "slot": "english|maths|gs|reading", "subject": "...", "lesson": "...", "duration": "...", "why": "one line reason", "completed": false }
  ],
  "focusAreas": ["weak subject names"],
  "strengths": ["strong subject names"],
  "studyTip": "one actionable tip for CDS prep today"
}`,
  };
};

export const generateAiBriefing = async ({ userName, dailyTarget, overview, mission }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildRuleBasedBriefing({ userName, dailyTarget, overview, mission });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_ANALYSIS_MODEL || DEFAULT_MODEL;
    const { system, user } = buildAiPrompt({ userName, dailyTarget, overview, mission });

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1200,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("Empty AI response");

    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, ""));
    return {
      headline: parsed.headline || "Today's study plan",
      summary: parsed.summary || "",
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities : [],
      focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      studyTip: parsed.studyTip || "",
      examCountdownDays: overview?.examCountdownDays ?? null,
      source: "ai",
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[ai-briefing] OpenAI failed, using rules:", err.message);
    return buildRuleBasedBriefing({ userName, dailyTarget, overview, mission });
  }
};

export const getOrCreateAiBriefing = async ({
  userId,
  userName,
  dailyTarget,
  overview,
  mission,
  force = false,
}) => {
  const dateKey = todayDateKey();
  const cached = mission?.generationMeta?.aiBriefing;

  if (!force && cached?.date === dateKey && cached?.headline) {
    return cached;
  }

  const briefing = await generateAiBriefing({ userName, dailyTarget, overview, mission });
  const payload = { ...briefing, date: dateKey };

  if (mission?._id) {
    mission.generationMeta = {
      ...(mission.generationMeta || {}),
      aiBriefing: payload,
    };
    mission.markModified("generationMeta");
    await mission.save();
  }

  return payload;
};
