import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import Chapter from "../models/Chapter.js";
import Paper from "../models/Paper.js";
import Subject from "../models/Subject.js";
import { runResearchBreakdown } from "./paperResearchService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");

let PDFParseClass;
async function loadPdfParse() {
  if (PDFParseClass) return PDFParseClass;
  const mod = await import("pdf-parse");
  PDFParseClass = mod.PDFParse ?? mod.default?.PDFParse ?? mod.default;
  if (typeof PDFParseClass !== "function") {
    throw new Error("pdf-parse: PDFParse class not found. Check pdf-parse package version.");
  }
  return PDFParseClass;
}

export async function getPdfBuffer(paper) {
  if (paper.sourceType === "cloudinary" && paper.pdfUrl) {
    const res = await fetch(paper.pdfUrl, { headers: { "User-Agent": "CDSJourney/1.0" } });
    if (!res.ok) throw new Error("Failed to fetch PDF from Cloudinary");
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  if (paper.sourceType === "upload" && paper.filePath) {
    const relative = paper.filePath.replace(/^\/uploads\/?/, "");
    const absolute = path.join(uploadRoot, relative);
    if (!fs.existsSync(absolute)) throw new Error("PDF file not found on server");
    return fs.readFileSync(absolute);
  }
  if (paper.sourceType === "url" && paper.url) {
    const res = await fetch(paper.url, { headers: { "User-Agent": "CDSJourney/1.0" } });
    if (!res.ok) throw new Error("Failed to fetch PDF from URL");
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  throw new Error("Paper has no PDF source (upload, Cloudinary, or URL)");
}

function buildSubjectChapterList(subjects, chaptersBySubject) {
  const lines = [];
  for (const s of subjects) {
    const chapters = chaptersBySubject[s._id.toString()] || [];
    lines.push(`Subject: ${s.name}`);
    if (chapters.length) {
      lines.push(`  Chapters: ${chapters.map((c) => c.chapterName).join(", ")}`);
    } else {
      lines.push(`  Chapters: (none - use "General" or subject name as chapter)`);
    }
  }
  return lines.join("\n");
}

function aggregateAnalysis(questions, subjectIdToName, chapterIdToMeta) {
  const bySubjectMap = new Map();
  const byChapterMap = new Map();

  for (const q of questions) {
    const sid = q.subjectId?.toString?.() ?? q.subjectId;
    const cid = q.chapterId?.toString?.() ?? q.chapterId;
    const sName = q.subjectName || subjectIdToName.get(sid) || "Unknown";
    const cName = q.chapterName || "Unknown";

    bySubjectMap.set(sid, (bySubjectMap.get(sid) || { subjectId: sid, subjectName: sName, count: 0 }));
    bySubjectMap.get(sid).count += 1;

    const cKey = cid || `${sid}-${cName}`;
    byChapterMap.set(cKey, byChapterMap.get(cKey) || {
      chapterId: cid,
      chapterName: cName,
      subjectName: sName,
      subjectId: sid,
      count: 0,
    });
    byChapterMap.get(cKey).count += 1;
  }

  const bySubject = Array.from(bySubjectMap.values()).sort((a, b) => b.count - a.count);
  const byChapter = Array.from(byChapterMap.values()).sort((a, b) => b.count - a.count);
  return { bySubject, byChapter };
}

export async function extractTextFromPaper(paper) {
  const PDFParse = await loadPdfParse();
  const buffer = await getPdfBuffer(paper);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = (result?.text || "").trim();
    if (typeof parser.destroy === "function") await parser.destroy();
    if (!text || text.length < 50) {
      throw new Error(
        "Could not extract enough text from the PDF. The file might be scanned (image-only). Upload a text-based PDF, or digitalize it first (e.g. run OCR when uploading)."
      );
    }
    return text;
  } catch (err) {
    if (typeof parser.destroy === "function") await parser.destroy();
    throw err;
  }
}

export async function runAIBifurcation(paperId) {
  const paper = await Paper.findById(paperId);
  if (!paper) throw new Error("Paper not found");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Add it in server/.env to use AI analysis.");

  const subjects = await Subject.find().sort({ name: 1 });
  if (!subjects.length) {
    throw new Error("No subjects found. Add at least one subject (and chapters) in the Dashboard to run AI analysis.");
  }
  const chapters = await Chapter.find().sort({ chapterName: 1 });
  const chaptersBySubject = chapters.reduce((acc, c) => {
    const sid = c.subjectId.toString();
    if (!acc[sid]) acc[sid] = [];
    acc[sid].push(c);
    return acc;
  }, {});

  const subjectChapterList = buildSubjectChapterList(subjects, chaptersBySubject);
  const nameToSubject = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s]));
  const nameToChapter = new Map();
  for (const c of chapters) {
    const key = `${c.subjectId}-${c.chapterName.trim().toLowerCase()}`;
    nameToChapter.set(key, c);
  }
  for (const s of subjects) {
    const key = `${s._id}-general`;
    if (!nameToChapter.has(key)) nameToChapter.set(key, { _id: null, subjectId: s._id, chapterName: "General" });
  }

  const rawText = await extractTextFromPaper(paper);
  const textSnippet = rawText.slice(0, 12000);
  if (rawText.length > 12000) {
    console.warn(`Paper text truncated to 12000 chars for API. Total length: ${rawText.length}`);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const sysPrompt = `You are an expert at classifying CDS/OTA exam questions by subject and chapter. You will receive:
1) A list of allowed subjects and their chapters (use ONLY these exact names).
2) Text extracted from a question paper PDF.

Your task: Identify each question in the paper (look for patterns like "1.", "Q.1", "(1)", "Question 1", etc.). For each question, output:
- number: the EXACT question number as printed in the PDF (e.g. if the paper shows "5." use "5"). Do not renumber.
- snippet: first 80 characters of the question text (for display)
- subjectName: must be exactly one of the subject names from the list
- chapterName: must be exactly one of the chapter names under that subject from the list

If a question does not clearly fit any chapter, use the closest match or "General" if the subject has no chapters. Never invent subject or chapter names.`;

  const userPrompt = `Allowed subjects and chapters (use these exact names):

${subjectChapterList}

---

Paper text (extracted from PDF):

${textSnippet}

---

Return a valid JSON object with a single key "questions" which is an array of objects. Each object must have: "number", "snippet", "subjectName", "chapterName". Example:
{"questions":[{"number":"1","snippet":"Which of the following is the highest peak...","subjectName":"Geography","chapterName":"Physical Features"},{"number":"2","snippet":"The Battle of Plassey was fought in...","subjectName":"History","chapterName":"Modern India"}]}
Return only the JSON, no markdown or explanation.`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI returned no response");

  let parsed;
  try {
    const cleaned = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error("AI response was not valid JSON: " + content.slice(0, 200));
  }

  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const subjectIdToName = new Map(subjects.map((s) => [s._id.toString(), s.name]));
  const chapterIdToMeta = new Map(chapters.map((c) => [c._id.toString(), { name: c.chapterName, subjectId: c.subjectId }]));

  const questions = [];
  for (const q of rawQuestions) {
    const sName = (q.subjectName || "").trim();
    const cName = (q.chapterName || "").trim();
    const subject = nameToSubject.get(sName.toLowerCase()) || subjects[0];
    if (!subject) continue;

    const key = `${subject._id}-${(cName || "general").toLowerCase()}`;
    let chapter = nameToChapter.get(key);
    if (!chapter) {
      const subChapters = chaptersBySubject[subject._id.toString()] || [];
      chapter = subChapters.find((ch) => ch.chapterName.trim().toLowerCase() === cName.toLowerCase()) || subChapters[0];
    }
    if (!chapter) {
      const subChapters = chaptersBySubject[subject._id.toString()] || [];
      chapter = subChapters[0] || null;
    }
    if (!chapter) continue;
    const rawNum = q.number != null && q.number !== "" ? String(q.number).trim() : null;
    questions.push({
      number: rawNum || String(questions.length + 1),
      snippet: String(q.snippet ?? "").slice(0, 200),
      subjectId: subject._id,
      chapterId: chapter._id,
      subjectName: subject.name,
      chapterName: chapter.chapterName || cName,
    });
  }

  const { bySubject, byChapter } = aggregateAnalysis(questions, subjectIdToName, chapterIdToMeta);

  return {
    questions,
    bySubject,
    byChapter,
    totalQuestions: questions.length,
  };
}

function buildExamIdentifier(paper, overrides = {}) {
  if (overrides.examIdentifier) return String(overrides.examIdentifier).trim();
  const parts = [paper.examType || "CDS", paper.year, paper.title].filter(Boolean);
  return parts.join(" ").trim() || `CDS ${paper.year}`;
}

function mapResearchToDbFormat(research, subjects, chaptersBySubject) {
  const nameToSubject = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s]));
  const bySubject = research.bySubject.map((r) => {
    const subject = nameToSubject.get(r.subjectName.trim().toLowerCase());
    return {
      subjectId: subject?._id ?? null,
      subjectName: r.subjectName,
      count: r.count,
    };
  });
  const byChapter = research.byChapter.map((c) => {
    const subject = nameToSubject.get(c.subjectName.trim().toLowerCase());
    const chapters = subject ? chaptersBySubject[subject._id.toString()] || [] : [];
    const chapter = chapters.find((ch) => ch.chapterName.trim().toLowerCase() === c.chapterName.trim().toLowerCase());
    return {
      chapterId: chapter?._id ?? null,
      chapterName: c.chapterName,
      subjectName: c.subjectName,
      subjectId: subject?._id ?? null,
      count: c.count,
    };
  });
  return { bySubject, byChapter };
}

/**
 * Full analysis: try PDF first; if 0 questions or failure, use research. For real papers, use both when PDF works.
 * @param {string} paperId
 * @param {{ examIdentifier?: string, isMockPaper?: boolean }} options
 */
export async function runFullAnalysis(paperId, options = {}) {
  const paper = await Paper.findById(paperId);
  if (!paper) throw new Error("Paper not found");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Add it in server/.env to use AI analysis.");

  const examIdentifier = buildExamIdentifier(paper, options);
  const isMockPaper = Boolean(options.isMockPaper);

  const subjects = await Subject.find().sort({ name: 1 });
  const chapters = await Chapter.find().sort({ chapterName: 1 });
  const chaptersBySubject = chapters.reduce((acc, c) => {
    const sid = c.subjectId.toString();
    if (!acc[sid]) acc[sid] = [];
    acc[sid].push(c);
    return acc;
  }, {});

  let pdfResult = null;
  try {
    const rawText = await extractTextFromPaper(paper);
    if (rawText && rawText.length >= 50) {
      const result = await runAIBifurcationWithText(paperId, rawText);
      if (result && result.questions && result.questions.length > 0) {
        pdfResult = result;
      }
    }
  } catch (e) {
    console.warn("PDF analysis failed (will use research):", e.message);
  }

  const researchResult = await runResearchBreakdown(examIdentifier, isMockPaper, subjects);
  const researchMapped = mapResearchToDbFormat(researchResult, subjects, chaptersBySubject);

  if (pdfResult && pdfResult.questions.length > 0) {
    return {
      questions: pdfResult.questions,
      bySubject: pdfResult.bySubject,
      byChapter: pdfResult.byChapter,
      totalQuestions: pdfResult.totalQuestions,
      source: "both",
      examIdentifier,
      isMockPaper,
      researchSummary: researchResult.summary,
      researchBreakdown: {
        bySubject: researchResult.bySubject,
        byChapter: researchResult.byChapter,
        summary: researchResult.summary,
      },
    };
  }

  return {
    questions: [],
    bySubject: researchMapped.bySubject,
    byChapter: researchMapped.byChapter,
    totalQuestions: researchResult.totalQuestions || 0,
    source: "research",
    examIdentifier,
    isMockPaper,
    researchSummary: researchResult.summary,
    researchBreakdown: {
      bySubject: researchResult.bySubject,
      byChapter: researchResult.byChapter,
      summary: researchResult.summary,
    },
  };
}

/**
 * Same as runAIBifurcation but accepts pre-extracted text (for use inside runFullAnalysis).
 */
async function runAIBifurcationWithText(paperId, rawText) {
  const paper = await Paper.findById(paperId);
  if (!paper) throw new Error("Paper not found");

  const subjects = await Subject.find().sort({ name: 1 });
  if (!subjects.length) return null;
  const chapters = await Chapter.find().sort({ chapterName: 1 });
  const chaptersBySubject = chapters.reduce((acc, c) => {
    const sid = c.subjectId.toString();
    if (!acc[sid]) acc[sid] = [];
    acc[sid].push(c);
    return acc;
  }, {});

  const subjectChapterList = buildSubjectChapterList(subjects, chaptersBySubject);
  const nameToSubject = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s]));
  const nameToChapter = new Map();
  for (const c of chapters) {
    const key = `${c.subjectId}-${c.chapterName.trim().toLowerCase()}`;
    nameToChapter.set(key, c);
  }

  const textSnippet = rawText.slice(0, 12000);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const sysPrompt = `You are an expert at classifying CDS/OTA exam questions by subject and chapter. Use ONLY the subject and chapter names from the list provided. CRITICAL: For each question use the EXACT question number as it appears in the PDF (e.g. if the paper shows "5." or "Q.5" use "5"). Do not renumber. For each question output: (1) number = exact PDF question number, (2) snippet = COMPLETE question text (stem + all four options (a),(b),(c),(d)), (3) subjectName, (4) chapterName. Never invent names.`;
  const userPrompt = `Allowed subjects and chapters:\n${subjectChapterList}\n\n---\nPaper text (preserve exact question numbers as printed):\n${textSnippet}\n\n---\nReturn valid JSON: {"questions":[{"number":"<exact number from PDF>","snippet":"<full question with all options>","subjectName":"...","chapterName":"..."}]}. Only JSON.`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  let parsed;
  try {
    parsed = JSON.parse(content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
  } catch {
    return null;
  }

  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const subjectIdToName = new Map(subjects.map((s) => [s._id.toString(), s.name]));
  const questions = [];
  for (const q of rawQuestions) {
    const sName = (q.subjectName || "").trim();
    const cName = (q.chapterName || "").trim();
    const subject = nameToSubject.get(sName.toLowerCase()) || subjects[0];
    if (!subject) continue;
    const key = `${subject._id}-${(cName || "general").toLowerCase()}`;
    let chapter = nameToChapter.get(key);
    if (!chapter) {
      const subChapters = chaptersBySubject[subject._id.toString()] || [];
      chapter = subChapters.find((ch) => ch.chapterName.trim().toLowerCase() === cName.toLowerCase()) || subChapters[0];
    }
    if (!chapter) continue;
    const rawNum = q.number != null && q.number !== "" ? String(q.number).trim() : null;
    questions.push({
      number: rawNum || String(questions.length + 1),
      snippet: String(q.snippet ?? q.questionText ?? "").slice(0, 800),
      subjectId: subject._id,
      chapterId: chapter._id,
      subjectName: subject.name,
      chapterName: chapter.chapterName || cName,
    });
  }

  const { bySubject, byChapter } = aggregateAnalysis(questions, subjectIdToName, new Map());
  return { questions, bySubject, byChapter, totalQuestions: questions.length };
}
