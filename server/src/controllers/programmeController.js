import Programme from "../models/Programme.js";
import Subject from "../models/Subject.js";
import { DEFAULT_COURSE_ID } from "../config/cdsCourses.js";
import { slugifyFolderName } from "../utils/slugifyFolder.js";
import {
  clearProgrammeCourse,
  deleteProgrammeCascade,
} from "../services/programmeCleanupService.js";

export const getProgrammes = async (req, res) => {
  const { cdsCycleId } = req.query;
  const filter = {};
  if (cdsCycleId) filter.cdsCycleId = String(cdsCycleId).trim();
  const programmes = await Programme.find(filter).sort({ name: 1 });
  res.json(programmes);
};

export const createProgramme = async (req, res) => {
  const { name, description, cdsCycleId } = req.body;
  if (!name) return res.status(400).json({ message: "Coaching batch name is required" });

  const cycle = String(cdsCycleId || "").trim() || DEFAULT_COURSE_ID;
  let folderSlug = slugifyFolderName(name);
  const exists = await Programme.findOne({ cdsCycleId: cycle, folderSlug });
  if (exists) {
    folderSlug = `${folderSlug}_${Date.now().toString(36)}`;
  }

  const programme = await Programme.create({
    name: name.trim(),
    folderSlug,
    cdsCycleId: cycle,
    description: description ?? "",
  });
  res.status(201).json(programme);
};

export const updateProgramme = async (req, res) => {
  const programme = await Programme.findById(req.params.id);
  if (!programme) return res.status(404).json({ message: "Coaching batch not found" });

  if (req.body.name != null) programme.name = String(req.body.name).trim();
  if (req.body.description != null) programme.description = String(req.body.description);
  await programme.save();
  res.json(programme);
};

export const deleteProgramme = async (req, res) => {
  const programme = await Programme.findById(req.params.id);
  if (!programme) return res.status(404).json({ message: "Coaching batch not found" });

  const cascade = req.query.cascade === "true" || req.body?.cascade === true;
  if (cascade) {
    const result = await deleteProgrammeCascade(programme._id);
    return res.json({
      message: "Coaching batch and all course data deleted",
      ...result,
    });
  }

  const count = await Subject.countDocuments({ programmeId: programme._id });
  if (count > 0) {
    return res.status(400).json({
      message: `This batch has ${count} subject(s). Clear course content first or use cascade delete.`,
    });
  }

  await programme.deleteOne();
  res.json({ message: "Coaching batch deleted" });
};

export const clearProgramme = async (req, res) => {
  try {
    const result = await clearProgrammeCourse(req.params.id);
    res.json({
      message: "Course content cleared",
      ...result,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not clear course" });
  }
};
