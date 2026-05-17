import { useEffect } from "react";
import { courseExamDate, getDefaultCourseId } from "../config/courses";

const FILTERS_STORAGE_KEY = "cds_dashboard_filters";
const FILTERS_SYNC_EVENT = "cds-dashboard-filters-updated";

const readSelectedCdsCycleId = () => {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return getDefaultCourseId();
    const parsed = JSON.parse(raw);
    return parsed.selectedCdsCycleId || parsed.selectedCourseId || getDefaultCourseId();
  } catch {
    return getDefaultCourseId();
  }
};

const getDaysLeft = (targetDate) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const t = new Date(targetDate);
  t.setHours(0, 0, 0, 0);
  const diffMs = t - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const DocumentTitle = () => {
  useEffect(() => {
    const apply = () => {
      const cycleId = readSelectedCdsCycleId();
      const exam = courseExamDate(cycleId);
      const days = getDaysLeft(exam);
      if (days > 1) {
        document.title = `CDS Journey · ${days} days to exam`;
      } else if (days === 1) {
        document.title = "CDS Journey · 1 day to exam";
      } else if (days === 0) {
        document.title = "CDS Journey · Exam today";
      } else {
        document.title = "CDS Journey";
      }
    };
    apply();
    const id = setInterval(apply, 60_000);
    window.addEventListener(FILTERS_SYNC_EVENT, apply);
    return () => {
      clearInterval(id);
      window.removeEventListener(FILTERS_SYNC_EVENT, apply);
    };
  }, []);
  return null;
};

export default DocumentTitle;
