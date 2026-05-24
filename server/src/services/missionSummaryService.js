import Content from "../models/Content.js";
import {
  CORE_DAILY_SLOTS,
  DEFAULT_READING_TARGET_MINUTES,
  SLOT_DEFAULT_MINUTES,
} from "../utils/subjectBuckets.js";

const secondsToMinutes = (seconds) => {
  const n = Number(seconds);
  if (!n || n <= 0) return null;
  return Math.max(1, Math.round(n / 60));
};

export const resolveItemMinutes = (item) => {
  if (item?.targetMinutes) return item.targetMinutes;
  if (item?.durationMinutes) return item.durationMinutes;
  if (item?.slot && SLOT_DEFAULT_MINUTES[item.slot]) return SLOT_DEFAULT_MINUTES[item.slot];
  return 30;
};

export const formatMinutesLabel = (minutes) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `${h} hr`;
  return `${h} hr ${rem} min`;
};

export const formatTotalGoalLabel = (totalMinutes) => {
  const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${m}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
};

/** Backfill durationMinutes from Content + slot defaults. */
export const enrichMissionItems = async (mission) => {
  if (!mission?.items?.length) return mission;

  const contentIds = mission.items.filter((i) => i.contentId).map((i) => i.contentId);
  const contents = contentIds.length
    ? await Content.find({ _id: { $in: contentIds } }).select("_id duration").lean()
    : [];
  const durationById = new Map(contents.map((c) => [String(c._id), secondsToMinutes(c.duration)]));

  let changed = false;
  for (const item of mission.items) {
    if (item.slot === "reading") {
      const target = item.targetMinutes || DEFAULT_READING_TARGET_MINUTES;
      if (item.targetMinutes !== target || item.durationMinutes !== target) {
        item.targetMinutes = target;
        item.durationMinutes = target;
        changed = true;
      }
      continue;
    }
    if (item.contentId) {
      const fromContent = durationById.get(String(item.contentId));
      const minutes = fromContent || SLOT_DEFAULT_MINUTES[item.slot] || 45;
      if (item.durationMinutes !== minutes) {
        item.durationMinutes = minutes;
        changed = true;
      }
    } else if (item.slot && SLOT_DEFAULT_MINUTES[item.slot] && !item.durationMinutes) {
      item.durationMinutes = SLOT_DEFAULT_MINUTES[item.slot];
      changed = true;
    }
  }

  if (changed && typeof mission.save === "function") {
    mission.markModified("items");
    await mission.save();
  }
  return mission;
};

/** Time-weighted progress for the core daily target (3 videos + reading). */
export const buildDailyTargetSummary = (mission, reading) => {
  const items = (mission?.items || []).filter((i) => CORE_DAILY_SLOTS.includes(i.slot));
  const ordered = CORE_DAILY_SLOTS.map((slot) => items.find((i) => i.slot === slot)).filter(Boolean);

  const targets = ordered.map((item) => {
    const minutes = resolveItemMinutes(item);
    return {
      slot: item.slot,
      label:
        item.slot === "english"
          ? "English Video"
          : item.slot === "maths"
            ? "Maths Video"
            : item.slot === "gs"
              ? "GS Video"
              : "Reading Session",
      title: item.title,
      contentId: item.contentId,
      minutes,
      minutesLabel: formatMinutesLabel(minutes),
      completed: Boolean(item.completed),
      subjectName: item.subjectName,
      chapterName: item.chapterName,
      reason: item.reason,
    };
  });

  const totalGoalMinutes = targets.reduce((sum, t) => sum + t.minutes, 0);

  let completedMinutes = 0;
  for (const item of ordered) {
    const goal = resolveItemMinutes(item);
    if (item.slot === "reading") {
      const actual = Math.min(reading?.actualMinutes || 0, reading?.targetMinutes || goal);
      completedMinutes += actual;
    } else if (item.completed) {
      completedMinutes += goal;
    }
  }

  const progressPercent =
    totalGoalMinutes > 0 ? Math.min(100, Math.round((completedMinutes / totalGoalMinutes) * 100)) : 0;

  return {
    targets,
    totalGoalMinutes,
    totalGoalLabel: formatTotalGoalLabel(totalGoalMinutes),
    completedMinutes: Math.round(completedMinutes),
    progressPercent,
  };
};

export const syncMissionProgressFromSummary = (mission, summary) => {
  if (!mission || !summary) return mission;
  mission.progressPercent = summary.progressPercent;
  const coreItems = (mission.items || []).filter((i) => CORE_DAILY_SLOTS.includes(i.slot));
  const allCoreDone = coreItems.length === 4 && coreItems.every((i) => i.completed);
  const readingDone =
    summary.completedMinutes >= summary.totalGoalMinutes * 0.95 ||
    coreItems.find((i) => i.slot === "reading")?.completed;

  if (allCoreDone) {
    mission.status = "completed";
    mission.completedAt = mission.completedAt || new Date();
  } else if (summary.progressPercent > 0) {
    mission.status = "partial";
  } else {
    mission.status = "active";
  }
  return mission;
};
