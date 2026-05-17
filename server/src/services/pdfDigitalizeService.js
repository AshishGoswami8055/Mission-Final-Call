/**
 * Ensure uploaded PDFs have copyable text (digitalized).
 * - If the PDF already has enough extractable text, it's left as-is.
 * - If it's scanned (little/no text), we try to add an OCR text layer so it becomes copyable.
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

/** Minimum character count to consider a PDF "already digital" (has copyable text). */
const MIN_TEXT_LENGTH = 200;

let PDFParseClass;
async function loadPdfParse() {
  if (PDFParseClass) return PDFParseClass;
  const mod = await import("pdf-parse");
  PDFParseClass = mod.PDFParse ?? mod.default?.PDFParse ?? mod.default;
  if (typeof PDFParseClass !== "function") {
    throw new Error("pdf-parse: PDFParse class not found.");
  }
  return PDFParseClass;
}

/**
 * Extract text from a PDF file path. Returns trimmed text and length.
 * @param {string} absolutePath - Full path to the PDF file
 * @returns {{ text: string, textLength: number }}
 */
export async function getTextFromPdfPath(absolutePath) {
  if (!fs.existsSync(absolutePath)) {
    throw new Error("PDF file not found");
  }
  const buffer = fs.readFileSync(absolutePath);
  const PDFParse = await loadPdfParse();
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = (result?.text || "").trim();
    if (typeof parser.destroy === "function") await parser.destroy();
    return { text, textLength: text.length };
  } catch (err) {
    if (typeof parser.destroy === "function") await parser.destroy();
    throw err;
  }
}

/**
 * Check if the PDF has enough extractable text to be considered "digital".
 * @param {string} absolutePath - Full path to the PDF file
 * @returns {{ hasEnoughText: boolean, textLength: number }}
 */
export async function checkPdfHasText(absolutePath) {
  const { textLength } = await getTextFromPdfPath(absolutePath);
  return { hasEnoughText: textLength >= MIN_TEXT_LENGTH, textLength };
}

/**
 * Run ocrmypdf to add a searchable text layer to a scanned PDF (in-place replacement).
 * Requires: pip install ocrmypdf (and Tesseract OCR installed on the system).
 * @param {string} absolutePath - Full path to the PDF file (will be overwritten)
 * @returns {{ success: boolean, error?: string }}
 */
export async function digitalizePdfWithOcrmypdf(absolutePath) {
  const dir = path.dirname(absolutePath);
  const base = path.basename(absolutePath, path.extname(absolutePath));
  const ext = path.extname(absolutePath);
  const tempPath = path.join(dir, `${base}_ocr_temp${ext}`);

  const runOcrmypdf = async (cmd, args) => {
    await execFileAsync(cmd, args, { maxBuffer: 50 * 1024 * 1024 });
  };

  try {
    await runOcrmypdf("ocrmypdf", [
      "-l", "eng+hin",
      "--output-type", "pdf",
      absolutePath,
      tempPath,
    ]);
  } catch (err) {
    if (err.code === "ENOENT" || /not found|not recognized/i.test(String(err.message))) {
      try {
        await runOcrmypdf("python", ["-m", "ocrmypdf", "-l", "eng+hin", "--output-type", "pdf", absolutePath, tempPath]);
      } catch (err2) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
        return { success: false, error: "ocrmypdf not installed. Install with: pip install ocrmypdf (and install Tesseract OCR)." };
      }
    } else {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
      const msg = [err.stderr, err.stdout, err.message].filter(Boolean).join(" ").slice(0, 200);
      return { success: false, error: msg || "ocrmypdf failed." };
    }
  }

  try {
    fs.renameSync(tempPath, absolutePath);
    return { success: true };
  } catch (err) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    return { success: false, error: err.message || "Failed to replace PDF with OCR version." };
  }
}

/**
 * Ensure the PDF at the given path has copyable text. If it has little/no text, try OCR.
 * @param {string} absolutePath - Full path to the PDF file (may be overwritten if OCR runs)
 * @returns {{ digitalized: boolean, warning?: string }}
 */
export async function ensurePdfDigitalized(absolutePath) {
  const { hasEnoughText, textLength } = await checkPdfHasText(absolutePath);
  if (hasEnoughText) {
    return { digitalized: true };
  }

  const ocrResult = await digitalizePdfWithOcrmypdf(absolutePath);
  if (ocrResult.success) {
    return { digitalized: true };
  }

  return {
    digitalized: false,
    warning: `This PDF has little or no copyable text (${textLength} chars). It may be scanned. ${ocrResult.error || "OCR was not run."} You can still try "Extract questions" or use a text-based PDF.`,
  };
}
