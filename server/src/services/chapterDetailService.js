/**
 * Chapter-level detail: sub-topics and question-wise explanations.
 * Uses AI + optional web search for answer key to produce accurate, researched explanations.
 */

const SERPER_URL = "https://google.serper.dev/search";

async function webSearch(query, apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch(SERPER_URL, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 8 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const organic = data.organic || [];
    return organic.map((o) => ({ title: o.title || "", snippet: o.snippet || "", link: o.link || "" }));
  } catch (e) {
    return null;
  }
}

/**
 * Get or build chapter detail: topics + questions with explanations.
 * Cached in PaperChapterDetail.
 */
export async function getOrCreateChapterDetail(paperId, subjectName, chapterName) {
  const Paper = (await import("../models/Paper.js")).default;
  const PaperAnalysis = (await import("../models/PaperAnalysis.js")).default;
  const PaperChapterDetail = (await import("../models/PaperChapterDetail.js")).default;
  const OpenAI = (await import("openai")).default;

  const paper = await Paper.findById(paperId);
  const analysis = await PaperAnalysis.findOne({ paperId }).lean();
  if (!paper || !analysis || analysis.status !== "completed") {
    throw new Error("Paper or analysis not found.");
  }

  const cacheKey = { paperId, subjectName: String(subjectName).trim(), chapterName: String(chapterName).trim() };
  let cached = await PaperChapterDetail.findOne(cacheKey).lean();
  if (cached) return cached;

  const questions = (analysis.questions || []).filter(
    (q) =>
      String(q.subjectName || "").trim().toLowerCase() === String(subjectName).trim().toLowerCase() &&
      String(q.chapterName || "").trim().toLowerCase() === String(chapterName).trim().toLowerCase()
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const examIdentifier = analysis.examIdentifier || `${paper.examType || "CDS"} ${paper.year}`;
  const serperKey = process.env.SERPER_API_KEY;

  if (questions.length === 0) {
    const typicalTopics = await getTypicalTopicsForChapter(openai, subjectName, chapterName);
    const doc = await PaperChapterDetail.create({
      ...cacheKey,
      topics: [],
      questions: [],
      noQuestions: true,
      typicalTopics: typicalTopics || [],
      examIdentifier,
    });
    return doc.toObject ? doc.toObject() : doc;
  }

  const topics = await getSubTopicsFromQuestions(openai, subjectName, chapterName, questions);
  const answerKeyMap = await tryFetchAnswerKey(serperKey, openai, examIdentifier, questions.length);
  const questionsWithExplanations = await generateExplanations(
    openai,
    serperKey,
    questions,
    answerKeyMap,
    topics,
    examIdentifier,
    subjectName,
    chapterName
  );

  const doc = await PaperChapterDetail.create({
    ...cacheKey,
    topics: topics || [],
    questions: questionsWithExplanations,
    noQuestions: false,
    examIdentifier,
  });
  return doc.toObject ? doc.toObject() : doc;
}

async function getTypicalTopicsForChapter(openai, subjectName, chapterName) {
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `For the chapter "${chapterName}" under subject "${subjectName}" in CDS/OTA exam, list 5-8 specific sub-topics or themes that questions typically cover (e.g. for Medieval India: Delhi Sultanate, Mughal Administration). Return ONLY a JSON array of strings, e.g. ["Topic 1", "Topic 2"]. No other text.`,
      },
    ],
    temperature: 0,
  });
  const raw = res.choices?.[0]?.message?.content?.trim() || "[]";
  try {
    const arr = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim());
    return Array.isArray(arr) ? arr.slice(0, 10) : [];
  } catch {
    return [];
  }
}

async function getSubTopicsFromQuestions(openai, subjectName, chapterName, questions) {
  const list = questions.map((q) => `Q${q.number}: ${(q.snippet || "").slice(0, 120)}`).join("\n");
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Group these questions from "${chapterName}" (${subjectName}) into 3-6 sub-topics. For each sub-topic give a short name and the question numbers that belong to it.
Questions:
${list}

Return valid JSON: { "topics": [ { "topicName": "Sub-topic name", "questionNumbers": ["1", "5", "7"] } ] }. Only JSON.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  const raw = res.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim());
    return Array.isArray(parsed.topics) ? parsed.topics : [];
  } catch {
    return [];
  }
}

async function tryFetchAnswerKey(serperKey, openai, examIdentifier, expectedCount) {
  const query = `${examIdentifier} answer key official question wise`;
  const results = await webSearch(query, serperKey);
  if (!results?.length) return {};
  const context = results.slice(0, 5).map((r) => `${r.title}\n${r.snippet}`).join("\n\n");
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `From the following search results about "${examIdentifier}" answer key, extract question number to correct option (A/B/C/D) mapping. If you find a list like "1-B, 2-A, 3-C" or "Q1: B" etc., return ONLY a JSON object: { "1": "B", "2": "A", ... }. Use only question number as key and A/B/C/D as value. If nothing found return {}. Search results:\n\n${context}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  const raw = res.choices?.[0]?.message?.content?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim());
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function generateExplanations(openai, serperKey, questions, answerKeyMap, topics, examIdentifier, subjectName, chapterName) {
  const numberToTopic = {};
  for (const t of topics || []) {
    for (const num of t.questionNumbers || []) {
      numberToTopic[String(num)] = t.topicName;
    }
  }
  const out = [];
  const searchResults = serperKey
    ? await webSearch(`${examIdentifier} ${subjectName} ${chapterName} questions solutions`, serperKey)
    : null;
  const searchContext = searchResults?.length
    ? searchResults.slice(0, 4).map((r) => r.snippet).join("\n")
    : "";

  for (const q of questions) {
    const correctAnswer = answerKeyMap[String(q.number)] || answerKeyMap[String(q.number).replace(/^0+/, "")] || null;
    const snippet = (q.snippet || "").trim() || "Question text not available.";
    const systemPrompt = `You are an expert educator for UPSC CDS/OTA exams. Your task is to write a FULL, ACCURATE explanation for each multiple-choice question. Rules:
- State the correct answer clearly (e.g. "Answer: (a)").
- Explain in full why that option is correct: use verified facts, constitutional/legal/scientific details as applicable. Be thorough and educational.
- Briefly explain why the other options are wrong or what they refer to, so the candidate learns.
- If the correct answer is not provided, explain what concept the question tests and what the candidate should know; do not guess the answer—say "Verify from official answer key."
- Use precise terminology. Write 3–6 sentences (or more if needed) for a complete explanation.`;

    const userContent = searchContext
      ? `Exam: ${examIdentifier}. Subject: ${subjectName}. Chapter: ${chapterName}.\n\nRelevant context (use only if it helps accuracy):\n${searchContext}\n\nFull question:\n${snippet}\n\nCorrect answer: ${correctAnswer || "Not provided - explain the concept only, do not guess."}\n\nWrite the full explanation (correct answer + why it is right + why others are wrong, factual and thorough):`
      : `Full question:\n${snippet}\n\nCorrect answer: ${correctAnswer || "Not provided."}\n\nWrite a full explanation (state answer, explain why it is correct with facts, and why other options are wrong):`;

    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0,
      max_tokens: 550,
    });
    const explanation = res.choices?.[0]?.message?.content?.trim() || "Explanation could not be generated.";

    out.push({
      number: String(q.number),
      snippet,
      correctAnswer: correctAnswer || null,
      explanation,
      subTopic: numberToTopic[String(q.number)] || null,
    });
  }

  return out;
}
