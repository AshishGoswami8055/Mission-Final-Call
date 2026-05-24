import Content from "../models/Content.js";
import Subject from "../models/Subject.js";
import Progress from "../models/Progress.js";
import Paper from "../models/Paper.js";
import PaperProgress from "../models/PaperProgress.js";
import DailyMission from "../models/DailyMission.js";
import Programme from "../models/Programme.js";
import { DEFAULT_COURSE_ID } from "../config/cdsCourses.js";
import {
  classifySubjectBucket,
  DEFAULT_READING_TARGET_MINUTES,
  isSunday,
  MISSION_VIDEO_SLOTS,
  todayDateKey,
} from "../utils/subjectBuckets.js";
import { getRecentContentIds } from "./studyHistoryService.js";

const RECENT_DAYS = 3;

const computeSubjectCompletion = async (userId, subjectIds) => {
  const map = new Map();
  for (const sid of subjectIds) map.set(String(sid), { total: 0, completed: 0 });

  const contents = await Content.find({ subjectId: { $in: subjectIds } }).select("_id subjectId").lean();
  const contentIds = contents.map((c) => c._id);
  const completed = await Progress.find({
    userId,
    contentId: { $in: contentIds },
    completed: true,
  })
    .select("contentId")
    .lean();
  const completedSet = new Set(completed.map((p) => String(p.contentId)));

  for (const c of contents) {
    const key = String(c.subjectId);
    const row = map.get(key) || { total: 0, completed: 0 };
    row.total += 1;
    if (completedSet.has(String(c._id))) row.completed += 1;
    map.set(key, row);
  }

  const rates = new Map();
  for (const [sid, row] of map) {
    rates.set(sid, row.total ? row.completed / row.total : 0);
  }
  return rates;
};

const scoreVideo = ({
  content,
  subjectRate,
  isCompleted,
  recentlyWatched,
  bucketCompletionAvg,
}) => {
  let score = 0;
  let reason = "default";

  if (!isCompleted) {
    score += 100;
    reason = "unwatched";
    const ageDays = (Date.now() - new Date(content.createdAt).getTime()) / (86400000);
    if (ageDays > 14) {
      score += 30;
      reason = "backlog";
    }
  } else if (bucketCompletionAvg >= 0.75) {
    score += 40;
    reason = "revision";
  }

  if (subjectRate < 0.35) {
    score += 50;
    if (reason === "default" || reason === "unwatched") reason = "weak_subject";
  }

  if (recentlyWatched) score -= 85;

  return { score, reason };
};

const pickVideoForSlot = async ({ userId, slot, subjectIds, recentSet, completionRates, bucketAvg }) => {
  const subjects = await Subject.find({ _id: { $in: subjectIds } }).select("name").lean();
  const matchingSubjectIds = subjects
    .filter((s) => classifySubjectBucket(s.name) === slot)
    .map((s) => s._id);

  if (!matchingSubjectIds.length) return null;

  const videos = await Content.find({
    subjectId: { $in: matchingSubjectIds },
    type: "video",
  })
    .populate("subjectId", "name")
    .populate("chapterId", "chapterName")
    .sort({ createdAt: 1 })
    .lean();

  if (!videos.length) return null;

  const contentIds = videos.map((v) => v._id);
  const completedRows = await Progress.find({
    userId,
    contentId: { $in: contentIds },
    completed: true,
  })
    .select("contentId")
    .lean();
  const completedSet = new Set(completedRows.map((r) => String(r.contentId)));

  let best = null;
  let bestScore = -Infinity;

  for (const video of videos) {
    const sid = String(video.subjectId?._id || video.subjectId);
    const subjectRate = completionRates.get(sid) || 0;
    const { score, reason } = scoreVideo({
      content: video,
      subjectRate,
      isCompleted: completedSet.has(String(video._id)),
      recentlyWatched: recentSet.has(String(video._id)),
      bucketCompletionAvg: bucketAvg,
    });
    if (score > bestScore) {
      bestScore = score;
      best = { video, reason };
    }
  }

  if (!best) return null;
  const { video, reason } = best;
  return {
    slot,
    contentId: video._id,
    title: video.title,
    subjectId: video.subjectId?._id || video.subjectId,
    subjectName: video.subjectId?.name || "",
    chapterName: video.chapterId?.chapterName || "",
    completed: completedSet.has(String(video._id)),
    reason,
  };
};

const pickSundayMockPaper = async (userId) => {
  const attempted = await PaperProgress.find({ userId, attempted: true }).select("paperId").lean();
  const attemptedSet = new Set(attempted.map((p) => String(p.paperId)));

  const papers = await Paper.find({}).sort({ year: -1, createdAt: -1 }).limit(80).lean();
  const unattempted = papers.filter((p) => !attemptedSet.has(String(p._id)));
  const pool = unattempted.length ? unattempted : papers;
  if (!pool.length) return null;

  const dayIndex = Math.floor(Date.now() / 86400000) % pool.length;
  const paper = pool[dayIndex];

  return {
    slot: "mock_test",
    paperId: paper._id,
    title: paper.title,
    subjectName: "Mock Test",
    chapterName: `PYQ ${paper.year}`,
    targetMinutes: paper.durationMinutes || 120,
    completed: attemptedSet.has(String(paper._id)),
    reason: "sunday_mock",
  };
};

const recalcMissionProgress = (mission) => {
  const items = mission.items || [];
  if (!items.length) {
    mission.progressPercent = 0;
    mission.status = "active";
    return;
  }
  const done = items.filter((i) => i.completed).length;
  mission.progressPercent = Math.round((done / items.length) * 100);
  if (done === items.length) {
    mission.status = "completed";
    mission.completedAt = mission.completedAt || new Date();
  } else if (done > 0) {
    mission.status = "partial";
  } else {
    mission.status = "active";
  }
};

export const generateDailyMission = async (userId, { force = false, date = new Date() } = {}) => {
  const dateKey = todayDateKey(date);

  if (!force) {
    const existing = await DailyMission.findOne({ userId, date: dateKey });
    if (existing) return existing;
  }

  const programmes = await Programme.find({ cdsCycleId: DEFAULT_COURSE_ID }).select("_id").lean();
  const programmeIds = programmes.map((p) => p._id);
  const subjects = programmeIds.length
    ? await Subject.find({ programmeId: { $in: programmeIds } }).select("_id name").lean()
    : await Subject.find({}).select("_id name").lean();

  const subjectIds = subjects.map((s) => s._id);
  const recentSet = await getRecentContentIds(userId, RECENT_DAYS);
  const completionRates = await computeSubjectCompletion(userId, subjectIds);

  const bucketAvgs = {};
  for (const slot of MISSION_VIDEO_SLOTS) {
    const slotSubjects = subjects.filter((s) => classifySubjectBucket(s.name) === slot);
    if (!slotSubjects.length) {
      bucketAvgs[slot] = 0;
      continue;
    }
    const rates = slotSubjects.map((s) => completionRates.get(String(s._id)) || 0);
    bucketAvgs[slot] = rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  const items = [];

  for (const slot of MISSION_VIDEO_SLOTS) {
    const picked = await pickVideoForSlot({
      userId,
      slot,
      subjectIds,
      recentSet,
      completionRates,
      bucketAvg: bucketAvgs[slot] || 0,
    });
    if (picked) items.push(picked);
  }

  items.push({
    slot: "reading",
    title: "Daily Reading Session",
    subjectName: "Reading",
    chapterName: "Newspaper / Notes",
    targetMinutes: DEFAULT_READING_TARGET_MINUTES,
    completed: false,
    reason: "default",
  });

  if (isSunday(date)) {
    const mock = await pickSundayMockPaper(userId);
    if (mock) items.push(mock);
  }

  const missionData = {
    userId,
    date: dateKey,
    missionType: isSunday(date) ? "sunday_mock" : "daily",
    items,
    progressPercent: 0,
    disciplineScore: 0,
    status: "active",
    generationMeta: {
      generatedAt: new Date().toISOString(),
      bucketAvgs,
      subjectCount: subjects.length,
    },
  };

  if (force) {
    await DailyMission.findOneAndUpdate({ userId, date: dateKey }, missionData, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    return DailyMission.findOne({ userId, date: dateKey });
  }

  return DailyMission.create(missionData);
};

export const getOrCreateTodayMission = async (userId) => {
  const dateKey = todayDateKey();
  let mission = await DailyMission.findOne({ userId, date: dateKey });
  if (!mission) mission = await generateDailyMission(userId);
  recalcMissionProgress(mission);
  await mission.save();
  return mission;
};

export const completeMissionItem = async (userId, { slot, contentId, paperId }) => {
  const dateKey = todayDateKey();
  const mission = await DailyMission.findOne({ userId, date: dateKey });
  if (!mission) return null;

  const item = mission.items.find((i) => {
    if (slot && i.slot !== slot) return false;
    if (contentId && String(i.contentId) !== String(contentId)) return false;
    if (paperId && String(i.paperId) !== String(paperId)) return false;
    return true;
  });

  if (item) {
    item.completed = true;
    item.completedAt = new Date();
  }

  recalcMissionProgress(mission);
  await mission.save();
  return mission;
};

export { recalcMissionProgress };
