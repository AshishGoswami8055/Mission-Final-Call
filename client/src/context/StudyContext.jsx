import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import { VIDEO_STREAK_GOAL_MINUTES } from "../constants/streak";
import { useAuth } from "./AuthContext";

const STORAGE_KEYS = {
  TODAY_DATE: "cds_study_today_date",
  TODAY_MINUTES: "cds_study_today_minutes",
  TODAY_BY_SUBJECT: "cds_study_today_by_subject",
  TARGET_MINUTES: "cds_study_target_minutes",
  TARGET_BY_SUBJECT: "cds_study_target_by_subject",
  WATCH_HISTORY: "cds_watch_history",
  CELEBRATION_SHOWN_DATE: "cds_celebration_shown_date",
  STREAK_CELEBRATION_SHOWN_DATE: "cds_streak_celebration_shown_date",
};

const HISTORY_MAX = 50;
const getTodayKey = () => new Date().toDateString();

const loadNumber = (key, defaultValue) => {
  try {
    const v = localStorage.getItem(key);
    return v != null ? Number(v) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WATCH_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveHistory = (list) => {
  try {
    localStorage.setItem(STORAGE_KEYS.WATCH_HISTORY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {}
};

const loadObject = (key, defaultValue = {}) => {
  try {
    const v = localStorage.getItem(key);
    if (!v) return defaultValue;
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
};

const saveObject = (key, obj) => {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {}
};

const StudyContext = createContext(null);

export function StudyProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [todayDate, setTodayDate] = useState(() => localStorage.getItem(STORAGE_KEYS.TODAY_DATE) || getTodayKey());
  const [todayMinutes, setTodayMinutesState] = useState(() =>
    loadNumber(STORAGE_KEYS.TODAY_MINUTES, 0)
  );
  const [todayMinutesBySubject, setTodayMinutesBySubject] = useState(() =>
    loadObject(STORAGE_KEYS.TODAY_BY_SUBJECT, {})
  );
  const [targetMinutes, setTargetMinutesState] = useState(() =>
    loadNumber(STORAGE_KEYS.TARGET_MINUTES, 60)
  );
  const [targetBySubject, setTargetBySubjectState] = useState(() =>
    loadObject(STORAGE_KEYS.TARGET_BY_SUBJECT, {})
  );
  const [watchHistory, setWatchHistory] = useState(loadHistory);
  const [celebrationShownDate, setCelebrationShownDate] = useState(() =>
    localStorage.getItem(STORAGE_KEYS.CELEBRATION_SHOWN_DATE) || ""
  );
  const [streakCelebrationShownDate, setStreakCelebrationShownDate] = useState(() =>
    localStorage.getItem(STORAGE_KEYS.STREAK_CELEBRATION_SHOWN_DATE) || ""
  );
  const [videoStreakStatus, setVideoStreakStatus] = useState(null);
  const streakCompleteRef = useRef(false);

  const ensureToday = useCallback(() => {
    const key = getTodayKey();
    if (todayDate !== key) {
      setTodayDate(key);
      setTodayMinutesState(0);
      setTodayMinutesBySubject({});
      localStorage.setItem(STORAGE_KEYS.TODAY_DATE, key);
      localStorage.setItem(STORAGE_KEYS.TODAY_MINUTES, "0");
      saveObject(STORAGE_KEYS.TODAY_BY_SUBJECT, {});
    }
  }, [todayDate]);

  const applyVideoStreakStatus = useCallback((status) => {
    if (!status) return;
    setVideoStreakStatus(status);
  }, []);

  const refreshVideoStreak = useCallback(async () => {
    if (!isAuthenticated) return null;
    try {
      const { data } = await api.get("/mission/streak/video");
      setVideoStreakStatus(data);
      return data;
    } catch {
      return null;
    }
  }, [isAuthenticated]);

  const addStudyMinutes = useCallback(
    (minutes, subjectId) => {
      ensureToday();
      const mins = Math.max(0, minutes);
      setTodayMinutesState((prev) => {
        const next = prev + mins;
        localStorage.setItem(STORAGE_KEYS.TODAY_DATE, getTodayKey());
        localStorage.setItem(STORAGE_KEYS.TODAY_MINUTES, String(next));
        return next;
      });
      if (subjectId) {
        setTodayMinutesBySubject((prev) => {
          const next = { ...prev, [subjectId]: (prev[subjectId] || 0) + mins };
          saveObject(STORAGE_KEYS.TODAY_BY_SUBJECT, next);
          return next;
        });
      }
    },
    [ensureToday]
  );

  const setTargetMinutes = useCallback((value) => {
    const num = Math.max(0, Math.floor(Number(value)) || 0);
    setTargetMinutesState(num);
    localStorage.setItem(STORAGE_KEYS.TARGET_MINUTES, String(num));
  }, []);

  const setSubjectTarget = useCallback((subjectId, value) => {
    const num = Math.max(0, Math.floor(Number(value)) || 0);
    setTargetBySubjectState((prev) => {
      const next = { ...prev, [subjectId]: num };
      if (num === 0) delete next[subjectId];
      saveObject(STORAGE_KEYS.TARGET_BY_SUBJECT, next);
      return next;
    });
  }, []);

  const setAllTargets = useCallback((total, bySubject) => {
    const t = Math.max(0, Math.floor(Number(total)) || 0);
    setTargetMinutesState(t);
    localStorage.setItem(STORAGE_KEYS.TARGET_MINUTES, String(t));
    const obj = bySubject && typeof bySubject === "object" ? bySubject : {};
    setTargetBySubjectState(obj);
    saveObject(STORAGE_KEYS.TARGET_BY_SUBJECT, obj);
  }, []);

  const addToWatchHistory = useCallback((entry) => {
    setWatchHistory((prev) => {
      const next = [
        { ...entry, watchedAt: entry.watchedAt || new Date().toISOString() },
        ...prev.filter((e) => e.contentId !== entry.contentId),
      ].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });
  }, []);

  const serverTodayVideoMinutes = videoStreakStatus?.todayVideoMinutes ?? 0;
  const effectiveTodayVideoMinutes = Math.max(todayMinutes, serverTodayVideoMinutes);
  const videoStreak = videoStreakStatus?.streak ?? 0;
  const videoStreakTodayComplete =
    videoStreakStatus?.todayComplete || effectiveTodayVideoMinutes >= VIDEO_STREAK_GOAL_MINUTES;
  const videoStreakProgressPercent = Math.min(
    100,
    Math.round((effectiveTodayVideoMinutes / VIDEO_STREAK_GOAL_MINUTES) * 100)
  );
  const videoStreakRecentDays = videoStreakStatus?.recentDays ?? [];

  const shouldShowCelebration = useMemo(() => {
    const key = getTodayKey();
    if (celebrationShownDate === key) return false;
    const current = todayDate === key ? todayMinutes : 0;
    return targetMinutes > 0 && current >= targetMinutes;
  }, [celebrationShownDate, todayDate, todayMinutes, targetMinutes]);

  const shouldShowStreakCelebration = useMemo(() => {
    const key = getTodayKey();
    if (streakCelebrationShownDate === key) return false;
    return effectiveTodayVideoMinutes >= VIDEO_STREAK_GOAL_MINUTES;
  }, [streakCelebrationShownDate, effectiveTodayVideoMinutes]);

  const markCelebrationShown = useCallback(() => {
    const key = getTodayKey();
    setCelebrationShownDate(key);
    localStorage.setItem(STORAGE_KEYS.CELEBRATION_SHOWN_DATE, key);
  }, []);

  const markStreakCelebrationShown = useCallback(() => {
    const key = getTodayKey();
    setStreakCelebrationShownDate(key);
    localStorage.setItem(STORAGE_KEYS.STREAK_CELEBRATION_SHOWN_DATE, key);
  }, []);

  useEffect(() => {
    const key = getTodayKey();
    if (todayDate !== key) {
      setTodayDate(key);
      setTodayMinutesState(0);
      setTodayMinutesBySubject({});
      streakCompleteRef.current = false;
      localStorage.setItem(STORAGE_KEYS.TODAY_DATE, key);
      localStorage.setItem(STORAGE_KEYS.TODAY_MINUTES, "0");
      saveObject(STORAGE_KEYS.TODAY_BY_SUBJECT, {});
    }
  }, [todayDate]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshVideoStreak();
    } else {
      setVideoStreakStatus(null);
    }
  }, [isAuthenticated, refreshVideoStreak]);

  useEffect(() => {
    const complete = effectiveTodayVideoMinutes >= VIDEO_STREAK_GOAL_MINUTES;
    if (isAuthenticated && complete && !streakCompleteRef.current) {
      refreshVideoStreak();
    }
    streakCompleteRef.current = complete;
  }, [effectiveTodayVideoMinutes, isAuthenticated, refreshVideoStreak]);

  const value = useMemo(
    () => ({
      todayMinutes,
      todayMinutesBySubject,
      targetMinutes,
      targetBySubject,
      setTargetMinutes,
      setSubjectTarget,
      setAllTargets,
      addStudyMinutes,
      watchHistory,
      addToWatchHistory,
      shouldShowCelebration,
      markCelebrationShown,
      ensureToday,
      videoStreak,
      effectiveTodayVideoMinutes,
      videoStreakTodayComplete,
      videoStreakProgressPercent,
      videoStreakRecentDays,
      videoStreakGoalMinutes: VIDEO_STREAK_GOAL_MINUTES,
      applyVideoStreakStatus,
      refreshVideoStreak,
      shouldShowStreakCelebration,
      markStreakCelebrationShown,
    }),
    [
      todayMinutes,
      todayMinutesBySubject,
      targetMinutes,
      targetBySubject,
      setTargetMinutes,
      setSubjectTarget,
      setAllTargets,
      addStudyMinutes,
      watchHistory,
      addToWatchHistory,
      shouldShowCelebration,
      markCelebrationShown,
      ensureToday,
      videoStreak,
      effectiveTodayVideoMinutes,
      videoStreakTodayComplete,
      videoStreakProgressPercent,
      videoStreakRecentDays,
      applyVideoStreakStatus,
      refreshVideoStreak,
      shouldShowStreakCelebration,
      markStreakCelebrationShown,
    ]
  );

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export function useStudy() {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error("useStudy must be used within StudyProvider");
  return ctx;
}
