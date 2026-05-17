import mongoose from "mongoose";
import Programme from "../models/Programme.js";
import Subject from "../models/Subject.js";
import { CDS_CYCLE_IDS, DEFAULT_COURSE_ID } from "../config/cdsCourses.js";

/**
 * Ensures each CDS cycle has a default "Main" coaching folder and attaches subjects to programmes.
 * Legacy subjects used courseId; new model uses programmeId only.
 */
export async function migrateProgrammesAndSubjects() {
  let createdProgrammes = 0;
  const mainByCycle = new Map();

  for (const cdsCycleId of CDS_CYCLE_IDS) {
    let main = await Programme.findOne({ cdsCycleId, folderSlug: "Main" });
    if (!main) {
      main = await Programme.create({
        name: "Main batch",
        folderSlug: "Main",
        cdsCycleId,
        description: "Default folder. Add Golf Batch, Arjuna Batch, etc. for each coaching.",
      });
      createdProgrammes += 1;
    }
    mainByCycle.set(cdsCycleId, main);
  }

  const coll = mongoose.connection.collection("subjects");
  const legacy = await coll
    .find({
      $or: [{ programmeId: { $exists: false } }, { programmeId: null }],
    })
    .toArray();

  let updatedSubjects = 0;
  const defaultMain = mainByCycle.get(DEFAULT_COURSE_ID) || (await Programme.findOne({ folderSlug: "Main" }));

  for (const doc of legacy) {
    const cid = doc.courseId && String(doc.courseId).trim() ? String(doc.courseId).trim() : DEFAULT_COURSE_ID;
    const main = mainByCycle.get(cid) || defaultMain;
    if (!main) continue;
    await coll.updateOne(
      { _id: doc._id },
      { $set: { programmeId: main._id }, $unset: { courseId: "" } }
    );
    updatedSubjects += 1;
  }

  await coll.updateMany(
    { $or: [{ programmeId: { $exists: false } }, { programmeId: null }] },
    { $set: { programmeId: defaultMain._id } }
  );

  await coll.updateMany({ programmeId: { $exists: true } }, { $unset: { courseId: "" } });

  await Subject.collection.dropIndex("name_1_courseId_1").catch(() => {});
  await Subject.collection.dropIndex("courseId_1").catch(() => {});
  await Subject.syncIndexes();

  return { createdProgrammes, updatedSubjects: legacy.length };
}
