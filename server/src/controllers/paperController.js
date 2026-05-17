import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import Paper from "../models/Paper.js";
import PaperAnalysis from "../models/PaperAnalysis.js";
import PaperProgress from "../models/PaperProgress.js";
import { detectTypeFromMime } from "../utils/contentHelpers.js";
import { ensurePdfDigitalized } from "../services/pdfDigitalizeService.js";
import { movePaperFileToYearFolder } from "../services/paperOrganizationService.js";
import {
  destroyCloudinaryRaw,
  safeUnlink,
  uploadPdfToCloudinary,
} from "../services/cloudinaryUploadService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "..", "..", "..", "uploads");

const paperCloudKey = () => String(process.env.CLOUDINARY_PAPER_CLOUD || "cloud1").trim();

const removeLocalFile = (relativeFilePath) => {
  if (!relativeFilePath) return;
  const trimmed = relativeFilePath.replace(/^\/+/, "");
  const absolute = path.resolve(__dirname, "..", "..", "..", trimmed);
  if (absolute.startsWith(uploadRoot) && fs.existsSync(absolute)) {
    fs.unlinkSync(absolute);
  }
};

const mapPaper = (paper, attempted = false) => {
  const item = typeof paper.toObject === "function" ? paper.toObject() : { ...paper };
  item.attempted = attempted;
  return item;
};

/** Parse filename to get year (last 4-digit 19xx/20xx) and title (name without .pdf, _ → space). */
function parsePdfFilename(originalname) {
  const nameWithoutExt = (originalname || "")
    .replace(/\.pdf$/i, "")
    .trim();
  const yearMatch = nameWithoutExt.match(/\b(19|20)\d{2}\b/g);
  const year = yearMatch
    ? Math.min(2100, Math.max(1990, Number(yearMatch[yearMatch.length - 1])))
    : new Date().getFullYear();
  const title = nameWithoutExt.replace(/[-_]+/g, " ").trim() || nameWithoutExt || "Paper";
  return { year, title };
}

export const getPapers = async (req, res) => {
  const { year, sort = "yearDesc", page = 1, limit = 50, cdsSlot } = req.query;
  const filter = {};
  if (year) filter.year = Number(year);
  if (cdsSlot === "1") filter.title = /CDS\s*1\b/i;
  if (cdsSlot === "2") filter.title = /CDS\s*2\b/i;

  const pageNumber = Math.max(Number(page) || 1, 1);
  const limitNumber = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const skip = (pageNumber - 1) * limitNumber;

  const sortOption = sort === "oldest"
    ? { year: 1, title: 1, createdAt: 1 }
    : { year: -1, title: 1, createdAt: 1 };

  const [papers, total] = await Promise.all([
    Paper.find(filter).sort(sortOption).skip(skip).limit(limitNumber),
    Paper.countDocuments(filter),
  ]);

  const progressList = await PaperProgress.find({
    userId: req.user._id,
    paperId: { $in: papers.map((p) => p._id) },
    attempted: true,
  }).select("paperId");
  const attemptedSet = new Set(progressList.map((p) => String(p.paperId)));

  const payload = papers.map((p) => mapPaper(p, attemptedSet.has(String(p._id))));

  res.json({
    items: payload,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber) || 1,
    },
  });
};

export const bulkCreatePapers = async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const pdfs = files.filter((f) => detectTypeFromMime(f.mimetype) === "pdf");
  if (pdfs.length === 0) {
    return res.status(400).json({ message: "No PDF files provided. Upload one or more PDFs." });
  }

  const currentYear = new Date().getFullYear();
  const created = [];
  const errors = [];

  for (const f of pdfs) {
    try {
      const { year, title } = parsePdfFilename(f.originalname);
      const absolutePdfPath = path.resolve(f.path);
      let pdfDigitalized = false;
      let pdfDigitalizeWarning = null;
      try {
        const digitalize = await ensurePdfDigitalized(absolutePdfPath);
        pdfDigitalized = digitalize.digitalized;
        pdfDigitalizeWarning = digitalize.warning;
      } catch (e) {
        pdfDigitalized = false;
        pdfDigitalizeWarning = "Could not check or digitalize PDF: " + (e.message || "Unknown error");
      }

      const cloudKey = paperCloudKey();
      const cloudResult = await uploadPdfToCloudinary({
        absoluteFilePath: absolutePdfPath,
        cloudType: cloudKey,
        year,
        titleHint: title,
        originalFilename: f.originalname,
      });
      safeUnlink(absolutePdfPath);

      const paper = await Paper.create({
        year,
        title,
        examType: "CDS",
        description: "",
        sourceType: "cloudinary",
        filePath: null,
        url: null,
        pdfUrl: cloudResult.secure_url,
        publicId: cloudResult.public_id,
        cloudType: cloudKey,
        durationMinutes: null,
        totalQuestions: null,
      });
      const mapped = mapPaper(paper);
      mapped.pdfDigitalized = pdfDigitalized;
      if (pdfDigitalizeWarning) mapped.pdfDigitalizeWarning = pdfDigitalizeWarning;
      created.push(mapped);
    } catch (e) {
      errors.push({ file: f.originalname, error: e.message || "Failed to create paper" });
      safeUnlink(f.path);
    }
  }

  res.status(201).json({
    created: created.length,
    failed: errors.length,
    items: created,
    errors: errors.length ? errors : undefined,
  });
};

export const getPaperById = async (req, res) => {
  const paper = await Paper.findById(req.params.id);
  if (!paper) return res.status(404).json({ message: "Paper not found" });

  const progress = await PaperProgress.findOne({
    userId: req.user._id,
    paperId: paper._id,
    attempted: true,
  });

  res.json(mapPaper(paper, Boolean(progress)));
};

export const createPaper = async (req, res) => {
  const { year, title, examType, description, sourceType, url, durationMinutes, totalQuestions } =
    req.body;

  if (!year || !title || !sourceType) {
    return res.status(400).json({ message: "year, title and sourceType are required" });
  }

  const numYear = Number(year);
  if (Number.isNaN(numYear) || numYear < 1990 || numYear > 2100) {
    return res.status(400).json({ message: "year must be a valid number (e.g. 2023)" });
  }

  let filePath = null;
  let safeUrl = null;

  if (sourceType === "upload") {
    if (!req.file) return res.status(400).json({ message: "PDF file is required for upload" });
    const type = detectTypeFromMime(req.file.mimetype);
    if (type !== "pdf") return res.status(400).json({ message: "Only PDF files are allowed" });
    const absolutePdfPath = path.resolve(req.file.path);
    try {
      const digitalize = await ensurePdfDigitalized(absolutePdfPath);
      req._pdfDigitalized = digitalize.digitalized;
      req._pdfDigitalizeWarning = digitalize.warning;
    } catch (e) {
      req._pdfDigitalized = false;
      req._pdfDigitalizeWarning = "Could not check or digitalize PDF: " + (e.message || "Unknown error");
    }
    const cloudKey = paperCloudKey();
    const cloudResult = await uploadPdfToCloudinary({
      absoluteFilePath: absolutePdfPath,
      cloudType: cloudKey,
      year: numYear,
      titleHint: title,
      originalFilename: req.file.originalname,
    });
    safeUnlink(absolutePdfPath);
    filePath = null;
    safeUrl = null;
    const paper = await Paper.create({
      year: numYear,
      title,
      examType: examType || "CDS",
      description: description || "",
      sourceType: "cloudinary",
      filePath,
      url: safeUrl,
      pdfUrl: cloudResult.secure_url,
      publicId: cloudResult.public_id,
      cloudType: cloudKey,
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      totalQuestions: totalQuestions ? Number(totalQuestions) : null,
    });

    const payload = mapPaper(paper);
    if (req._pdfDigitalized !== undefined) {
      payload.pdfDigitalized = req._pdfDigitalized;
      if (req._pdfDigitalizeWarning) payload.pdfDigitalizeWarning = req._pdfDigitalizeWarning;
    }
    return res.status(201).json(payload);
  } else if (sourceType === "url") {
    if (!url) return res.status(400).json({ message: "url is required for url sourceType" });
    safeUrl = url;
  } else {
    return res.status(400).json({ message: "sourceType must be upload or url" });
  }

  const paper = await Paper.create({
    year: numYear,
    title,
    examType: examType || "CDS",
    description: description || "",
    sourceType,
    filePath,
    url: safeUrl,
    pdfUrl: null,
    publicId: null,
    cloudType: null,
    durationMinutes: durationMinutes ? Number(durationMinutes) : null,
    totalQuestions: totalQuestions ? Number(totalQuestions) : null,
  });

  const payload = mapPaper(paper);
  if (req._pdfDigitalized !== undefined) {
    payload.pdfDigitalized = req._pdfDigitalized;
    if (req._pdfDigitalizeWarning) payload.pdfDigitalizeWarning = req._pdfDigitalizeWarning;
  }
  res.status(201).json(payload);
};

export const updatePaper = async (req, res) => {
  const paper = await Paper.findById(req.params.id);
  if (!paper) return res.status(404).json({ message: "Paper not found" });

  const {
    year,
    title,
    examType,
    description,
    sourceType,
    url,
    durationMinutes,
    totalQuestions,
  } = req.body;

  if (year !== undefined) paper.year = Number(year);
  if (title !== undefined) paper.title = title;
  if (examType !== undefined) paper.examType = examType;
  if (description !== undefined) paper.description = description;
  if (durationMinutes !== undefined) paper.durationMinutes = durationMinutes ? Number(durationMinutes) : null;
  if (totalQuestions !== undefined) paper.totalQuestions = totalQuestions ? Number(totalQuestions) : null;

  if (sourceType === "url" && url !== undefined) {
    if (paper.sourceType === "cloudinary" && paper.publicId && paper.cloudType) {
      await destroyCloudinaryRaw({ cloudType: paper.cloudType, publicId: paper.publicId });
    }
    if (paper.filePath) removeLocalFile(paper.filePath);
    paper.sourceType = "url";
    paper.url = url;
    paper.filePath = null;
    paper.pdfUrl = null;
    paper.publicId = null;
    paper.cloudType = null;
  }
  if (sourceType === "upload" && req.file) {
    if (paper.sourceType === "cloudinary" && paper.publicId && paper.cloudType) {
      await destroyCloudinaryRaw({ cloudType: paper.cloudType, publicId: paper.publicId });
    }
    if (paper.sourceType === "upload" && paper.filePath) {
      removeLocalFile(paper.filePath);
    }
    const absolutePdfPath = path.resolve(req.file.path);
    try {
      const digitalize = await ensurePdfDigitalized(absolutePdfPath);
      req._pdfDigitalized = digitalize.digitalized;
      req._pdfDigitalizeWarning = digitalize.warning;
    } catch (e) {
      req._pdfDigitalized = false;
      req._pdfDigitalizeWarning = "Could not check or digitalize PDF: " + (e.message || "Unknown error");
    }
    const cloudKey = paperCloudKey();
    const cloudResult = await uploadPdfToCloudinary({
      absoluteFilePath: absolutePdfPath,
      cloudType: cloudKey,
      year: paper.year,
      titleHint: paper.title,
      originalFilename: req.file.originalname,
    });
    safeUnlink(absolutePdfPath);
    paper.sourceType = "cloudinary";
    paper.pdfUrl = cloudResult.secure_url;
    paper.publicId = cloudResult.public_id;
    paper.cloudType = cloudKey;
    paper.filePath = null;
    paper.url = null;
  }

  if (paper.sourceType === "upload" && paper.filePath) {
    const absoluteCurrent = path.resolve(__dirname, "..", "..", "..", paper.filePath.replace(/^\/+/, ""));
    if (absoluteCurrent.startsWith(uploadRoot) && fs.existsSync(absoluteCurrent)) {
      const moved = movePaperFileToYearFolder({
        absoluteSourcePath: absoluteCurrent,
        year: paper.year,
        preferredName: path.basename(absoluteCurrent),
      });
      paper.filePath = moved.filePath;
    }
  }

  await paper.save();
  const payload = mapPaper(paper);
  if (req._pdfDigitalized !== undefined) {
    payload.pdfDigitalized = req._pdfDigitalized;
    if (req._pdfDigitalizeWarning) payload.pdfDigitalizeWarning = req._pdfDigitalizeWarning;
  }
  res.json(payload);
};

export const deletePaper = async (req, res) => {
  const paper = await Paper.findById(req.params.id);
  if (!paper) return res.status(404).json({ message: "Paper not found" });

  if (paper.sourceType === "cloudinary" && paper.publicId && paper.cloudType) {
    await destroyCloudinaryRaw({ cloudType: paper.cloudType, publicId: paper.publicId });
  }
  if (paper.sourceType === "upload" && paper.filePath) {
    removeLocalFile(paper.filePath);
  }
  await PaperProgress.deleteMany({ paperId: paper._id });
  await PaperAnalysis.deleteOne({ paperId: paper._id });
  await paper.deleteOne();
  res.json({ message: "Paper deleted" });
};

export const togglePaperProgress = async (req, res) => {
  const paper = await Paper.findById(req.params.id);
  if (!paper) return res.status(404).json({ message: "Paper not found" });

  const existing = await PaperProgress.findOne({
    userId: req.user._id,
    paperId: paper._id,
  });

  if (existing) {
    existing.attempted = !existing.attempted;
    if (existing.attempted) existing.attemptedAt = new Date();
    await existing.save();
    return res.json({ attempted: existing.attempted });
  }

  await PaperProgress.create({
    userId: req.user._id,
    paperId: paper._id,
    attempted: true,
    attemptedAt: new Date(),
  });
  res.json({ attempted: true });
};
