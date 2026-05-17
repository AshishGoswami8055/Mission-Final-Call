import Chapter from "../models/Chapter.js";
import Content from "../models/Content.js";
import Progress from "../models/Progress.js";
import Programme from "../models/Programme.js";
import Subject from "../models/Subject.js";
import SubjectCloudMapping from "../models/SubjectCloudMapping.js";
import { destroyCloudinaryVideo } from "../services/cloudinaryUploadService.js";

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
  const subject = await Subject.findById(id);
  if (!subject) return res.status(404).json({ message: "Subject not found" });

  const chapters = await Chapter.find({ subjectId: id }).select("_id");
  const chapterIds = chapters.map((chapter) => chapter._id);

  const contents = await Content.find({ subjectId: id })
    .select("_id sourceType cloudType publicId");
  const contentIds = contents.map((content) => content._id);

  // Free up Cloudinary storage for any video content tied to this subject.
  const cloudVideos = contents.filter(
    (c) => c.sourceType === "cloudinary" && c.publicId
  );
  await Promise.allSettled(
    cloudVideos.map((c) =>
      destroyCloudinaryVideo({ cloudType: c.cloudType, publicId: c.publicId })
    )
  );

  await Progress.deleteMany({
    $or: [{ chapterId: { $in: chapterIds } }, { contentId: { $in: contentIds } }],
  });
  await Content.deleteMany({ subjectId: id });
  await Chapter.deleteMany({ subjectId: id });
  await SubjectCloudMapping.deleteOne({ subjectId: id });
  await subject.deleteOne();

  res.json({ message: "Subject and related data deleted" });
};
