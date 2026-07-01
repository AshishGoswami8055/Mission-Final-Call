import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";

/**
 * Course-view content: stats from chapterStats (no full-programme fetch).
 * Loads lesson rows only for the active subject.
 */
export const useDashboardCourseContents = ({
  selectedProgrammeId,
  activeCourseSubjectId,
  subjects,
  chapters,
  chapterStats,
}) => {
  const [courseContents, setCourseContents] = useState([]);
  const [loadingSubjectContents, setLoadingSubjectContents] = useState(false);

  const subjectStats = useMemo(() => {
    const map = {};
    for (const subject of subjects) {
      map[String(subject._id)] = { videos: 0, pdfs: 0, completed: 0 };
    }
    for (const chapter of chapters) {
      const sid = String(chapter.subjectId?._id || chapter.subjectId || "");
      const stats = chapterStats[chapter._id];
      if (!sid || !stats || !map[sid]) continue;
      map[sid].videos += stats.totalVideos || 0;
      map[sid].pdfs += stats.totalPdfs || 0;
      map[sid].completed += stats.completedCount || 0;
    }
    return map;
  }, [subjects, chapters, chapterStats]);

  const fetchSubjectCourseContents = useCallback(async (subjectId) => {
    if (!subjectId || !selectedProgrammeId) {
      setCourseContents([]);
      return;
    }
    setLoadingSubjectContents(true);
    try {
      const { data } = await api.get("/contents", {
        params: {
          programmeId: selectedProgrammeId,
          subjectId,
          sort: "chapter",
          page: 1,
          limit: 500,
        },
      });
      setCourseContents(data.items || []);
    } catch {
      setCourseContents([]);
    } finally {
      setLoadingSubjectContents(false);
    }
  }, [selectedProgrammeId]);

  useEffect(() => {
    if (activeCourseSubjectId) {
      void fetchSubjectCourseContents(activeCourseSubjectId);
    } else {
      setCourseContents([]);
    }
  }, [activeCourseSubjectId, fetchSubjectCourseContents]);

  const patchCourseContent = useCallback((contentId, patch) => {
    setCourseContents((prev) =>
      prev.map((item) => (String(item._id) === String(contentId) ? { ...item, ...patch } : item))
    );
  }, []);

  const removeCourseContent = useCallback((contentId) => {
    setCourseContents((prev) => prev.filter((item) => String(item._id) !== String(contentId)));
  }, []);

  return {
    courseContents,
    subjectStats,
    loadingSubjectContents,
    fetchSubjectCourseContents,
    patchCourseContent,
    removeCourseContent,
    setCourseContents,
  };
};

export default useDashboardCourseContents;
