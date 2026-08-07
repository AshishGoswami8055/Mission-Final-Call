const DAY_MS = 24 * 60 * 60 * 1000;

export const clampNumber = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || 0));

export const normalizeAnswerText = (value = "") =>
  String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[-_\s]+/g, " ")
    .trim();

export const answersMatch = (submitted, accepted = []) => {
  const submittedKey = normalizeAnswerText(submitted);
  if (!submittedKey) return false;
  const values = Array.isArray(accepted) ? accepted : [accepted];
  return values.some((value) => normalizeAnswerText(value) === submittedKey);
};

export const deriveReviewResult = ({ correct, requestedResult }) => {
  if (!correct) return "again";
  if (["again", "good", "easy"].includes(requestedResult)) return requestedResult;
  return "good";
};

/**
 * Deterministic, explainable exam-prep SRS.
 * Wrong answers reset the interval and confidence. Fast correct answers earn a
 * modest bonus without allowing intervals beyond six months.
 */
export const calculateSrsUpdate = (
  item,
  { result, correct = result !== "again", responseTimeMs = 0, mode = "legacy" },
  now = new Date()
) => {
  const currentEase = clampNumber(item?.easeFactor || 2.5, 1.3, 3);
  const currentInterval = Math.max(0, Number(item?.intervalDays) || 0);
  const currentConfidence = clampNumber(item?.confidence || 0, 0, 100);

  let easeFactor = currentEase;
  let intervalDays = currentInterval;
  let confidence = currentConfidence;
  let level = item?.level || "new";

  if (result === "again" || !correct) {
    intervalDays = 1;
    easeFactor = clampNumber(currentEase - 0.25, 1.3, 3);
    confidence = clampNumber(currentConfidence - 24, 0, 100);
    level = "new";
  } else if (result === "good") {
    intervalDays =
      currentInterval <= 0
        ? 2
        : Math.max(currentInterval + 1, Math.round(currentInterval * currentEase));
    easeFactor = clampNumber(currentEase + 0.02, 1.3, 3);
    confidence = clampNumber(currentConfidence + (responseTimeMs <= 12000 ? 12 : 8), 0, 100);
    level = intervalDays >= 7 ? "learning" : level;
  } else {
    intervalDays =
      currentInterval <= 0
        ? 4
        : Math.max(
            currentInterval + 2,
            Math.round(currentInterval * (currentEase + 0.35))
          );
    easeFactor = clampNumber(currentEase + 0.08, 1.3, 3);
    confidence = clampNumber(currentConfidence + (responseTimeMs <= 8000 ? 20 : 15), 0, 100);
    level = intervalDays >= 14 && confidence >= 70 ? "mastered" : "learning";
  }

  intervalDays = clampNumber(intervalDays, 1, 180);
  const nextReviewAt = new Date(now.getTime() + intervalDays * DAY_MS);
  const masteredAt =
    level === "mastered" ? item?.masteredAt || now : level === "new" ? null : item?.masteredAt;

  return {
    easeFactor,
    intervalDays,
    confidence,
    level,
    masteredAt,
    lastReviewedAt: now,
    nextReviewAt,
    reviewCount: (Number(item?.reviewCount) || 0) + 1,
    correctCount: (Number(item?.correctCount) || 0) + (correct ? 1 : 0),
    wrongCount: (Number(item?.wrongCount) || 0) + (correct ? 0 : 1),
    lastWrongAt: correct ? item?.lastWrongAt || null : now,
    updatedByMode: mode,
    lastPracticeMode: mode,
  };
};

export const applySrsReview = async (item, review, now = new Date()) => {
  const update = calculateSrsUpdate(item, review, now);
  Object.assign(item, update);
  await item.save();
  return item;
};

/** Higher score means the word should surface sooner in Weak Words. */
export const calculateWeakWordScore = (item, now = new Date()) => {
  const wrong = Number(item?.wrongCount) || 0;
  const correct = Number(item?.correctCount) || 0;
  const confidenceGap = 100 - clampNumber(item?.confidence || 0, 0, 100);
  const dueAt = item?.nextReviewAt ? new Date(item.nextReviewAt).getTime() : now.getTime();
  const overdueDays = Math.max(0, Math.floor((now.getTime() - dueAt) / DAY_MS));
  const recentWrong = item?.lastWrongAt
    ? Math.max(0, 14 - Math.floor((now.getTime() - new Date(item.lastWrongAt).getTime()) / DAY_MS))
    : 0;
  const errorRate = wrong + correct > 0 ? wrong / (wrong + correct) : 0;

  return Math.round(
    wrong * 14 +
      errorRate * 40 +
      confidenceGap * 0.35 +
      Math.min(overdueDays, 30) * 2 +
      recentWrong * 2
  );
};

export const isWeakVocabulary = (item, now = new Date()) =>
  (Number(item?.wrongCount) || 0) >= 2 ||
  (Number(item?.confidence) || 0) < 35 ||
  calculateWeakWordScore(item, now) >= 45;
