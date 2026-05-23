import Programme from "../models/Programme.js";
import Subject from "../models/Subject.js";
import { deleteSubjectTree } from "../services/subjectCleanupService.js";

export const getSubjects = async (req, res) => {
  const { programmeId } = req.query;
  const filter = {};
  if (programmeId) filter.programmeId = programmeId;
  const subjects = await Subject.find(filter).sort({ name: 1 });
  res.json(subjects);
};

export const createSubject = async (req, res) => {
  const { name, description, programmeId } = req.body;
  if (!name) return res.status(400).json({ message: "Subject name is required" });
  if (!programmeId) return res.status(400).json({ message: "programmeId (coaching batch) is required" });

  const programme = await Programme.findById(programmeId);
  if (!programme) return res.status(404).json({ message: "Coaching batch not found" });

  const subject = await Subject.create({ name, description, programmeId });
  res.status(201).json(subject);
};

export const updateSubject = async (req, res) => {
  const { id } = req.params;
  const subject = await Subject.findById(id);
  if (!subject) return res.status(404).json({ message: "Subject not found" });

  subject.name = req.body.name ?? subject.name;
  subject.description = req.body.description ?? subject.description;
  if (req.body.programmeId !== undefined) {
    const next = String(req.body.programmeId || "").trim();
    if (next) {
      const programme = await Programme.findById(next);
      if (!programme) return res.status(404).json({ message: "Coaching batch not found" });
      subject.programmeId = programme._id;
    }
  }
  await subject.save();
  res.json(subject);
};

export const deleteSubject = async (req, res) => {
  const { id } = req.params;
  const result = await deleteSubjectTree(id);
  if (!result.deleted) return res.status(404).json({ message: "Subject not found" });
  res.json({
    message: "Subject and all lessons removed (including Cloudinary PDFs/videos)",
    ...result,
  });
};
