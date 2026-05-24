import Content from "../models/Content.js";
import Subject from "../models/Subject.js";
import Progress from "../models/Progress.js";
import Programme from "../models/Programme.js";
import ReadingSession from "../models/ReadingSession.js";
import { DEFAULT_COURSE_ID } from "../config/cdsCourses.js";
import {
  classifySubjectBucket,
  DEFAULT_READING_TARGET_MINUTES,
  MISSION_VIDEO_SLOTS,
  SLOT_DEFAULT_MINUTES,
  todayDateKey,
} from "../utils/subjectBuckets.js";
import { getOrCreateTodayMission, recalcMissionProgress } from "./missionGenerationService.js";
import { enrichMissionItems, buildDailyTargetSummary } from "./missionSummaryService.js";

const secondsToMinutes = (seconds) => {
  const n = Number(seconds);
  if (!n || n <= 0) return null;
  return Math.max(1, Math.round(n / 60));
};

const getProgrammeSubjectIds = async () => {
  const programmes = await Programme.find({ cdsCycleId: DEFAULT_COURSE_ID }).select("_id").lean();
  const programmeIds = programmes.map((p) => p._id);
  const subjects = programmeIds.length
    ? await Subject.find({ programmeId: { $in: programmeIds } }).select("_id name").lean()
    : await Subject.find({}).select("_id name").lean();
  return subjects;
};

export const getVideosForMissionPicker = async ({ slot, search = "", limit = 50 }) => {
  const subjects = await getProgrammeSubjectIds();
  const bucket = slot && MISSION_VIDEO_SLOTS.includes(slot) ? slot : null;

  let subjectIds = subjects.map((s) => s._id);
  if (bucket) {
    subjectIds = subjects.filter((s) => classifySubjectBucket(s.name) === bucket).map((s) => s._id);
  }

  if (!subjectIds.length) return [];

  const filter = {
    subjectId: { $in: subjectIds },
    type: "video",
  };
  if (search?.trim()) {
    filter.title = { $regex: search.trim(), $options: "i" };
  }

  const videos = await Content.find(filter)
    .populate("subjectId", "name")
    .populate("chapterId", "chapterName")
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .lean();

  return videos.map((video) => ({
    _id: video._id,
    title: video.title,
    subjectName: video.subjectId?.name || "",
    chapterName: video.chapterId?.chapterName || "",
    durationMinutes:
      secondsToMinutes(video.duration) || SLOT_DEFAULT_MINUTES[bucket] || SLOT_DEFAULT_MINUTES.gs || 45,
    bucket: classifySubjectBucket(video.subjectId?.name || ""),
  }));
};

const buildVideoItem = async (userId, slot, content) => {
  const durationMinutes =
    secondsToMinutes(content.duration) || SLOT_DEFAULT_MINUTES[slot] || 45;
  const completed = await Progress.findOne({
    userId,
    contentId: content._id,
    completed: true,
  }).lean();

  return {
    slot,
    contentId: content._id,
    title: content.title,
    subjectId: content.subjectId?._id || content.subjectId,
    subjectName: content.subjectId?.name || "",
    chapterName: content.chapterId?.chapterName || "",
    durationMinutes,
    targetMinutes: null,
    completed: Boolean(completed),
    completedAt: completed ? new Date() : null,
    reason: "manual",
  };
};

export const replaceMissionSlotVideo = async (userId, slot, contentId) => {
  if (!MISSION_VIDEO_SLOTS.includes(slot)) {
    throw new Error("Slot must be english, maths, or gs");
  }

  const content = await Content.findById(contentId)
    .populate("subjectId", "name")
    .populate("chapterId", "chapterName");
  if (!content || content.type !== "video") {
    throw new Error("Video not found");
  }

  const mission = await getOrCreateTodayMission(userId);
  const idx = mission.items.findIndex((i) => i.slot === slot);
  const nextItem = await buildVideoItem(userId, slot, content);

  if (idx >= 0) {
    Object.assign(mission.items[idx], nextItem);
  } else {
    mission.items.push(nextItem);
  }

  mission.markModified("items");
  await enrichMissionItems(mission);
  recalcMissionProgress(mission);
  await mission.save();
  return mission;
};

export const updateMissionReadingTarget = async (userId, targetMinutes) => {
  const minutes = Math.max(15, Math.min(240, Number(targetMinutes) || DEFAULT_READING_TARGET_MINUTES));
  const mission = await getOrCreateTodayMission(userId);
  const idx = mission.items.findIndex((i) => i.slot === "reading");

  if (idx >= 0) {
    mission.items[idx].targetMinutes = minutes;
    mission.items[idx].durationMinutes = minutes;
    mission.items[idx].reason = "manual";
  } else {
    mission.items.push({
      slot: "reading",
      title: "Reading Session",
      subjectName: "Reading",
      chapterName: "Newspaper / Notes",
      targetMinutes: minutes,
      durationMinutes: minutes,
      completed: false,
      reason: "manual",
    });
  }

  const dateKey = todayDateKey();
  await ReadingSession.findOneAndUpdate(
    { userId, date: dateKey },
    { targetMinutes: minutes },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  mission.markModified("items");
  recalcMissionProgress(mission);
  await mission.save();
  return mission;
};

export const addManualMissionItem = async (
  userId,
  { title, contentId, durationMinutes, subjectName, chapterName }
) => {
  if (!title?.trim() && !contentId) {
    throw new Error("Title or video is required");
  }

  const mission = await getOrCreateTodayMission(userId);
  let item;

  if (contentId) {
    const content = await Content.findById(contentId)
      .populate("subjectId", "name")
      .populate("chapterId", "chapterName");
    if (!content || content.type !== "video") {
      throw new Error("Video not found");
    }
    const bucket = classifySubjectBucket(content.subjectId?.name || "") || "gs";
    item = await buildVideoItem(userId, "custom", content);
    item.title = title?.trim() || content.title;
    item.subjectName = content.subjectId?.name || subjectName || "";
    item.chapterName = content.chapterId?.chapterName || chapterName || "";
    item.slot = "custom";
  } else {
    const minutes = Math.max(5, Math.min(240, Number(durationMinutes) || 30));
    item = {
      slot: "custom",
      title: title.trim(),
      subjectName: subjectName?.trim() || "Manual",
      chapterName: chapterName?.trim() || "",
      durationMinutes: minutes,
      targetMinutes: minutes,
      completed: false,
      reason: "manual",
    };
  }

  mission.items.push(item);
  mission.markModified("items");
  recalcMissionProgress(mission);
  await mission.save();
  return mission;
};

export const updateManualMissionItem = async (
  userId,
  itemId,
  { title, contentId, durationMinutes, subjectName, chapterName, targetMinutes }
) => {
  const mission = await getOrCreateTodayMission(userId);
  const item = mission.items.id(itemId);
  if (!item) throw new Error("Task not found");

  if (item.slot === "reading") {
    return updateMissionReadingTarget(userId, targetMinutes ?? durationMinutes ?? item.targetMinutes);
  }

  if (MISSION_VIDEO_SLOTS.includes(item.slot) && contentId) {
    return replaceMissionSlotVideo(userId, item.slot, contentId);
  }

  if (contentId && item.slot === "custom") {
    const content = await Content.findById(contentId)
      .populate("subjectId", "name")
      .populate("chapterId", "chapterName");
    if (!content || content.type !== "video") throw new Error("Video not found");
    const built = await buildVideoItem(userId, "custom", content);
    Object.assign(item, built, {
      title: title?.trim() || content.title,
      slot: "custom",
    });
  } else {
    if (title?.trim()) item.title = title.trim();
    if (subjectName?.trim()) item.subjectName = subjectName.trim();
    if (chapterName?.trim()) item.chapterName = chapterName.trim();
    const minutes = Number(durationMinutes ?? targetMinutes);
    if (minutes > 0) {
      item.durationMinutes = Math.max(5, Math.min(240, minutes));
      item.targetMinutes = item.durationMinutes;
    }
    item.reason = "manual";
  }

  mission.markModified("items");
  await enrichMissionItems(mission);
  recalcMissionProgress(mission);
  await mission.save();
  return mission;
};

export const removeMissionItem = async (userId, itemId) => {
  const mission = await getOrCreateTodayMission(userId);
  const item = mission.items.id(itemId);
  if (!item) throw new Error("Task not found");
  if (item.slot !== "custom") {
    throw new Error("Only extra manual tasks can be removed. Edit core slots instead.");
  }

  item.deleteOne();
  mission.markModified("items");
  recalcMissionProgress(mission);
  await mission.save();
  return mission;
};

export const buildMissionPlanResponse = async (userId) => {
  const mission = await getOrCreateTodayMission(userId);
  const dateKey = todayDateKey();
  const reading =
    (await ReadingSession.findOne({ userId, date: dateKey })) ||
    (await ReadingSession.create({ userId, date: dateKey, targetMinutes: DEFAULT_READING_TARGET_MINUTES }));
  await enrichMissionItems(mission);
  const dailyTarget = buildDailyTargetSummary(mission, reading);
  return { mission, reading, dailyTarget };
};
