import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");

let PDFParseClass;

async function loadPdfParse() {
  if (PDFParseClass) return PDFParseClass;
  const mod = await import("pdf-parse");
  PDFParseClass = mod.PDFParse ?? mod.default?.PDFParse ?? mod.default;
  if (typeof PDFParseClass !== "function") {
    throw new Error("pdf-parse: PDFParse class not found");
  }
  return PDFParseClass;
}

export async function getPdfBufferFromSource({ sourceType, filePath, pdfUrl, url }) {
  if (sourceType === "cloudinary" && pdfUrl) {
    const res = await fetch(pdfUrl, { headers: { "User-Agent": "CDSJourney/1.0" } });
    if (!res.ok) throw new Error("Failed to fetch PDF from Cloudinary");
    return Buffer.from(await res.arrayBuffer());
  }
  if (sourceType === "upload" && filePath) {
    const relative = String(filePath).replace(/^\/uploads\/?/, "");
    const absolute = path.join(uploadRoot, relative);
    if (!fs.existsSync(absolute)) throw new Error("PDF file not found on server");
    return fs.readFileSync(absolute);
  }
  if (sourceType === "url" && url) {
    const res = await fetch(url, { headers: { "User-Agent": "CDSJourney/1.0" } });
    if (!res.ok) throw new Error("Failed to fetch PDF from URL");
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("No PDF source available");
}

export async function extractTextFromPdfBuffer(buffer, { minLength = 30 } = {}) {
  const PDFParse = await loadPdfParse();
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = (result?.text || "").trim();
    if (typeof parser.destroy === "function") await parser.destroy();
    if (!text || text.length < minLength) {
      throw new Error("Not enough extractable text in PDF");
    }
    return text;
  } catch (err) {
    if (typeof parser.destroy === "function") await parser.destroy();
    throw err;
  }
}

export async function extractTextFromPdfSource(source) {
  const buffer = await getPdfBufferFromSource(source);
  return extractTextFromPdfBuffer(buffer);
}
