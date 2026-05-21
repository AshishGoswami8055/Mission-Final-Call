import Programme from "../models/Programme.js";
import Subject from "../models/Subject.js";
import TelegramChannelMapping from "../models/TelegramChannelMapping.js";
import { deleteSubjectTree } from "./subjectCleanupService.js";

export const clearProgrammeCourse = async (programmeId) => {
  const programme = await Programme.findById(programmeId);
  if (!programme) {
    throw new Error("Coaching batch not found");
  }

  const subjects = await Subject.find({ programmeId }).select("_id name");
  let deletedContents = 0;
  let deletedChapters = 0;

  for (const subject of subjects) {
    const result = await deleteSubjectTree(subject._id);
    if (result.deleted) {
      deletedContents += result.deletedContents || 0;
      deletedChapters += result.deletedChapters || 0;
    }
  }

  const mappingResult = await TelegramChannelMapping.deleteMany({ programmeId });

  return {
    deletedSubjects: subjects.length,
    deletedContents,
    deletedChapters,
    deletedMappings: mappingResult.deletedCount,
  };
};

export const deleteProgrammeCascade = async (programmeId) => {
  const cleared = await clearProgrammeCourse(programmeId);
  await Programme.deleteOne({ _id: programmeId });
  return cleared;
};
