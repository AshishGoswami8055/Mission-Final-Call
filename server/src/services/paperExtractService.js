/**
 * Extract questions (number, text, 4 options) from paper PDF in sequence.
 * No classification or research – just reliable extraction for display + copy.
 * English only (Hindi translations in the paper are omitted).
 */

import OpenAI from "openai";
import Paper from "../models/Paper.js";
import { extractTextFromPaper } from "./paperAnalysisService.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const TEXT_LIMIT = 120000; // send more of the PDF so later questions aren't cut off
const MAX_TOKENS = 16000;

function buildPrompts(textSnippet) {
  const sysPrompt = `You extract multiple-choice exam questions from PDF text. Rules:
- number: exact question number as in the paper (e.g. "1", "16").
- text: the question stem. Use ENGLISH ONLY; if the paper has English then Hindi, include only the English part.
- options: array of exactly 4 strings – the four choices (a),(b),(c),(d) in order. Use ENGLISH ONLY; omit Hindi.

If the document has both English and Hindi for the same item, output only the English. Extract every question in order. Return valid JSON only. Do NOT return an empty "questions" array if the text contains any question numbers (1., 2., Q1, etc.) or options (a) b) c) d).`;

  const userPrompt = `Extract all questions. English only (skip Hindi). Return JSON:
{"questions":[{"number":"1","text":"Question in English","options":["A","B","C","D"]}]}

Document text:
${textSnippet}`;

  return { sysPrompt, userPrompt };
}

function buildFallbackPrompts(textSnippet) {
  const sysPrompt = `Extract every multiple-choice question from the text. For each question return: "number" (as in the doc), "text" (question stem, English only if both languages present), "options" (array of 4 strings, English only). Return JSON: {"questions":[...]}. Never return an empty questions array if there are numbers like 1. 2. or options like (a) (b).`;

  const userPrompt = `Extract all MCQs. Use English only when both English and Hindi appear. JSON with "questions" array. Text:\n${textSnippet}`;

  return { sysPrompt, userPrompt };
}

function parseResponse(content) {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned);
}

function normalizeQuestions(parsed) {
  const raw = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return raw.map((q) => ({
    number: String(q.number ?? "").trim() || "?",
    text: String(q.text ?? "").trim(),
    options: Array.isArray(q.options) ? q.options.slice(0, 4).map((o) => String(o).trim()) : [],
  }));
}

export async function extractQuestionsFromPaper(paperId) {
  const paper = await Paper.findById(paperId);
  if (!paper) throw new Error("Paper not found");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in server/.env");

  const rawText = await extractTextFromPaper(paper);
  const textLen = rawText.length;
  const textSnippet = rawText.slice(0, TEXT_LIMIT);
  if (textLen > TEXT_LIMIT) {
    console.warn(`[extract] PDF text truncated to ${TEXT_LIMIT} chars (total ${textLen})`);
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_ANALYSIS_MODEL || DEFAULT_MODEL;

  async function runExtraction(sysPrompt, userPrompt) {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: MAX_TOKENS,
    });
    const content = completion.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Extraction returned no response");
    return content;
  }

  let content;
  try {
    const { sysPrompt, userPrompt } = buildPrompts(textSnippet);
    content = await runExtraction(sysPrompt, userPrompt);
  } catch (err) {
    console.error("[extract] First extraction failed:", err.message);
    throw err;
  }

  let parsed;
  try {
    parsed = parseResponse(content);
  } catch (e) {
    throw new Error("Extraction response was not valid JSON");
  }

  let questions = normalizeQuestions(parsed);

  if (questions.length === 0 && textSnippet.length > 500) {
    console.warn("[extract] First pass returned 0 questions, trying fallback prompt");
    try {
      const fallback = buildFallbackPrompts(textSnippet);
      const fallbackContent = await runExtraction(fallback.sysPrompt, fallback.userPrompt);
      const fallbackParsed = parseResponse(fallbackContent);
      questions = normalizeQuestions(fallbackParsed);
    } catch (fallbackErr) {
      console.warn("[extract] Fallback extraction failed:", fallbackErr.message);
    }
  }

  if (questions.length === 0) {
    throw new Error(
      "No questions were found in the PDF. Use a text-based PDF (not a scanned image). If the PDF has text, try again."
    );
  }

  return { questions };
}
