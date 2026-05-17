import {
  getDefaultCloud,
  isKnownCloud,
  listAvailableClouds,
} from "../config/cloudinary.js";
import Subject from "../models/Subject.js";
import SubjectCloudMapping from "../models/SubjectCloudMapping.js";
import { fetchAllCloudinaryUsage } from "../services/cloudinaryUsageService.js";

/** Resolve the cloud key that should be used for a given subject. */
export const resolveCloudForSubject = async (subjectId) => {
  const fallback = getDefaultCloud();
  if (!subjectId) return fallback;
  const mapping = await SubjectCloudMapping.findOne({ subjectId }).lean();
  if (mapping?.cloudType && isKnownCloud(mapping.cloudType)) {
    return mapping.cloudType;
  }
  return fallback;
};

/** GET /api/cloud-mappings/clouds — available cloud accounts. */
export const listClouds = async (req, res) => {
  res.json({
    available: listAvailableClouds(),
    default: getDefaultCloud(),
  });
};

/** GET /api/cloud-mappings/usage — storage / credits snapshot per configured account. */
export const getCloudinaryUsage = async (req, res) => {
  const data = await fetchAllCloudinaryUsage();
  res.json(data);
};

/**
 * GET /api/cloud-mappings — list all subject→cloud assignments alongside
 * subjects that are still on the default cloud, so the UI can render a single
 * editable table.
 */
export const listMappings = async (req, res) => {
  const [mappings, subjects] = await Promise.all([
    SubjectCloudMapping.find().lean(),
    Subject.find()
      .populate("programmeId", "name folderSlug cdsCycleId")
      .sort({ name: 1 })
      .lean(),
  ]);

  const mappingBySubject = new Map(
    mappings.map((m) => [String(m.subjectId), m.cloudType])
  );
  const defaultCloud = getDefaultCloud();
  const available = listAvailableClouds();

  const rows = subjects.map((subject) => {
    const explicit = mappingBySubject.get(String(subject._id)) || null;
    const effective = explicit && isKnownCloud(explicit) ? explicit : defaultCloud;
    return {
      subjectId: String(subject._id),
      subjectName: subject.name,
      programmeName: subject.programmeId?.name || null,
      cdsCycleId: subject.programmeId?.cdsCycleId || null,
      assignedCloud: explicit,
      effectiveCloud: effective,
      isDefault: !explicit,
    };
  });

  res.json({
    default: defaultCloud,
    available,
    items: rows,
  });
};

/** POST /api/cloud-mappings — upsert a single mapping. */
export const upsertMapping = async (req, res) => {
  const { subjectId, cloudType } = req.body;
  if (!subjectId) return res.status(400).json({ message: "subjectId is required" });
  if (!cloudType) return res.status(400).json({ message: "cloudType is required" });
  if (!isKnownCloud(cloudType)) {
    return res.status(400).json({
      message: `Unknown cloudType "${cloudType}". Available: ${listAvailableClouds().join(", ") || "(none configured)"}`,
    });
  }
  const subject = await Subject.findById(subjectId);
  if (!subject) return res.status(404).json({ message: "Subject not found" });

  const doc = await SubjectCloudMapping.findOneAndUpdate(
    { subjectId },
    { subjectId, cloudType: String(cloudType).trim() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json(doc);
};

/** PUT /api/cloud-mappings/bulk — set many mappings at once. */
export const bulkUpsertMappings = async (req, res) => {
  const entries = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!entries.length) {
    return res.status(400).json({ message: "items[] is required" });
  }
  const available = new Set(listAvailableClouds());
  const errors = [];
  const ops = [];

  for (const entry of entries) {
    const subjectId = entry?.subjectId;
    const cloudType = entry?.cloudType;
    if (!subjectId || !cloudType) {
      errors.push({ subjectId, reason: "subjectId and cloudType are required" });
      continue;
    }
    if (!available.has(cloudType)) {
      errors.push({ subjectId, reason: `Unknown cloudType "${cloudType}"` });
      continue;
    }
    ops.push({
      updateOne: {
        filter: { subjectId },
        update: { $set: { subjectId, cloudType: String(cloudType).trim() } },
        upsert: true,
      },
    });
  }

  if (ops.length) await SubjectCloudMapping.bulkWrite(ops);
  res.json({ updated: ops.length, errors });
};

/** DELETE /api/cloud-mappings/:subjectId — fall back to default. */
export const deleteMapping = async (req, res) => {
  await SubjectCloudMapping.deleteOne({ subjectId: req.params.subjectId });
  res.json({ message: "Mapping cleared. Subject will use the default cloud." });
};
