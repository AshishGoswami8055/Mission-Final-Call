/**
 * Research-based paper breakdown: web search + AI synthesis.
 * For real/mock CDS/OTA papers when PDF parsing yields no questions or for full breakdown.
 */

const SERPER_URL = "https://google.serper.dev/search";

async function webSearch(query, apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch(SERPER_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 10 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const organic = data.organic || [];
    return organic.map((o) => ({ title: o.title || "", snippet: o.snippet || "", link: o.link || "" })).filter((o) => o.snippet || o.title);
  } catch (e) {
    console.warn("Serper search failed:", e.message);
    return null;
  }
}

/**
 * @param {string} examIdentifier - e.g. "CDS 1 2025", "CDS 2 2025 GS"
 * @param {boolean} isMockPaper
 * @param {Array} subjects - from DB (for mapping names to IDs if we want)
 * @returns { Promise<{ bySubject: Array<{subjectName, count}>, byChapter: Array<{subjectName, chapterName, count}>, summary: string }> }
 */
export async function runResearchBreakdown(examIdentifier, isMockPaper, subjects = []) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY is required for research breakdown.");

  const searchQuery = isMockPaper
    ? `${examIdentifier} mock test paper subject wise distribution topic breakdown`
    : `${examIdentifier} CDS OTA exam question paper subject wise breakdown topic distribution analysis`;

  const serperKey = process.env.SERPER_API_KEY;
  const searchResults = await webSearch(searchQuery, serperKey);

  const searchContext = searchResults?.length
    ? "Relevant web search results:\n" +
      searchResults
        .slice(0, 8)
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`)
        .join("\n\n")
    : "No web results available. Use your knowledge of CDS/OTA exam pattern and typical subject distribution for this exam.";

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: openaiKey });

  const systemPrompt = `You are an expert on UPSC CDS (Combined Defence Services) and OTA (Officers' Training Academy) exams. You provide accurate, professional subject-wise and topic-wise breakdowns of question papers.

Your task:
1. If web search results are provided, use them to extract or infer the subject-wise and topic-wise distribution of questions for the given exam (e.g. "CDS 2 2025", "CDS 1 2025 GS").
2. If no web results are provided, use your knowledge of typical CDS/OTA paper patterns: common subjects are General Knowledge, English, Mathematics, General Science; topics include History, Geography, Polity, Economy, Science, Current Affairs, etc. Provide a plausible breakdown for the requested exam.
3. For mock papers, indicate that the breakdown is based on typical pattern or available mock analysis.
4. Always return valid JSON. Be specific: subject names and topic/chapter names (e.g. "Indian History", "World Geography", "Indian Polity", "Physics", "Current Affairs").
5. Total questions should sum to a reasonable number (e.g. 120 for GS, 100 for GK).`;

  const userPrompt = `Exam identifier: "${examIdentifier}"
Type: ${isMockPaper ? "Mock paper" : "Real/Official paper"}

${searchContext}

Provide a detailed breakdown in this exact JSON format (use only the keys below):
{
  "summary": "2-3 sentences describing the paper pattern and source of this breakdown (e.g. from web research / typical CDS pattern).",
  "totalQuestions": 120,
  "bySubject": [
    { "subjectName": "History", "count": 25 },
    { "subjectName": "Geography", "count": 20 }
  ],
  "byChapter": [
    { "subjectName": "History", "chapterName": "Ancient India", "count": 5 },
    { "subjectName": "History", "chapterName": "Medieval India", "count": 8 },
    { "subjectName": "Geography", "chapterName": "Indian Geography", "count": 12 }
  ]
}
Include all subjects and their chapters with counts. Return only the JSON, no markdown.`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const raw = completion.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("AI returned no research breakdown.");

  let parsed;
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Research response was not valid JSON.");
  }

  const bySubject = Array.isArray(parsed.bySubject) ? parsed.bySubject : [];
  const byChapter = Array.isArray(parsed.byChapter) ? parsed.byChapter : [];
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const totalQuestions = typeof parsed.totalQuestions === "number" ? parsed.totalQuestions : 0;

  return {
    bySubject: bySubject.map((s) => ({ subjectName: String(s.subjectName || ""), count: Number(s.count) || 0 })),
    byChapter: byChapter.map((c) => ({
      subjectName: String(c.subjectName || ""),
      chapterName: String(c.chapterName || ""),
      count: Number(c.count) || 0,
    })),
    summary: summary || "Breakdown based on AI analysis and available information.",
    totalQuestions,
  };
}
