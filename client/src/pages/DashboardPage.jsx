import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import {
  FiBookOpen,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiLayers,
  FiMoreVertical,
  FiPlay,
  FiPlus,
  FiUploadCloud,
} from "react-icons/fi";
import ChapterModal from "../components/ChapterModal";
import CloudMappingModal from "../components/CloudMappingModal";
import ContentCard from "../components/ContentCard";
import ContentEditModal from "../components/ContentEditModal";
import ContentModal from "../components/ContentModal";
import BatchCourseView from "../components/BatchCourseView";
import CoachingBatchSection from "../components/CoachingBatchSection";
import OperationProgressOverlay from "../components/OperationProgressOverlay";
import ExamCountdown from "../components/ExamCountdown";
import Layout from "../components/Layout";
import { SkeletonCard } from "../components/Loader";
import ProgrammeModal from "../components/ProgrammeModal";
import StudyTracker from "../components/StudyTracker";
import SubjectModal from "../components/SubjectModal";
import { useLocation, useNavigate } from "react-router-dom";
import { COURSES, getCourseById, getDefaultCourseId } from "../config/courses";

const FILTERS_STORAGE_KEY = "cds_dashboard_filters";

const getInitialFilters = () => {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) {
      return {
        selectedCdsCycleId: getDefaultCourseId(),
        selectedProgrammeId: "",
        selectedSubjectId: "",
        selectedChapterId: "",
        search: "",
        sort: "chapter",
        page: 1,
        expandedSubjectId: null,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      selectedCdsCycleId: parsed.selectedCdsCycleId || parsed.selectedCourseId || getDefaultCourseId(),
      selectedProgrammeId: parsed.selectedProgrammeId || "",
      selectedSubjectId: parsed.selectedSubjectId || "",
      selectedChapterId: parsed.selectedChapterId || "",
      search: parsed.search || "",
      sort: parsed.sort || "chapter",
      page: parsed.page || 1,
      expandedSubjectId: parsed.expandedSubjectId || null,
    };
  } catch {
    return {
      selectedCdsCycleId: getDefaultCourseId(),
      selectedProgrammeId: "",
      selectedSubjectId: "",
      selectedChapterId: "",
      search: "",
      sort: "chapter",
      page: 1,
      expandedSubjectId: null,
    };
  }
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const initialFilters = getInitialFilters();
  // If the persisted cycle id is no longer in the COURSES list (e.g. legacy
  // "cds-1-2026" after we narrowed the UI to CDS (II) 2026), drop it to the
  // default rather than getting stuck on a missing cycle.
  const safeInitialCycleId = COURSES.some((c) => c.id === initialFilters.selectedCdsCycleId)
    ? initialFilters.selectedCdsCycleId
    : getDefaultCourseId();
  const [selectedCdsCycleId, setSelectedCdsCycleId] = useState(safeInitialCycleId);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState(initialFilters.selectedProgrammeId);
  const [programmes, setProgrammes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [chapterStats, setChapterStats] = useState({});
  const [contents, setContents] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(initialFilters.selectedSubjectId);
  const [selectedChapterId, setSelectedChapterId] = useState(initialFilters.selectedChapterId);
  const [expandedSubjectId, setExpandedSubjectId] = useState(initialFilters.expandedSubjectId);
  const [search, setSearch] = useState(initialFilters.search);
  const [sort, setSort] = useState(initialFilters.sort);
  const [page, setPage] = useState(initialFilters.page);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadState, setUploadState] = useState({
    active: false,
    phase: "idle",
    percent: 0,
    bytesLoaded: 0,
    bytesTotal: 0,
    bytesPerSecond: 0,
    fileIndex: 0,
    filesTotal: 0,
    currentFile: null,
    message: null,
    cloudType: null,
    error: null,
    browserPercent: 0,
    variant: "upload",
  });

  const [subjectModal, setSubjectModal] = useState(null);
  const [chapterModal, setChapterModal] = useState(null);
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [programmeModalOpen, setProgrammeModalOpen] = useState(false);
  const [cloudMappingModalOpen, setCloudMappingModalOpen] = useState(false);
  const [activeCourseSubjectId, setActiveCourseSubjectId] = useState("");
  const [showLibraryView, setShowLibraryView] = useState(false);
  const [courseContents, setCourseContents] = useState([]);
  const [subjectUpdates, setSubjectUpdates] = useState({});
  const [updatesAvailable, setUpdatesAvailable] = useState(null);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatingSubjectId, setUpdatingSubjectId] = useState("");
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [renamingSubjectId, setRenamingSubjectId] = useState("");
  const [deletingSubjectId, setDeletingSubjectId] = useState("");
  const [deletingContentId, setDeletingContentId] = useState("");
  const [clearingCourse, setClearingCourse] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const mobileActionsRef = useRef(null);

  useEffect(() => {
    if (!mobileActionsOpen) return undefined;
    const onPointerDown = (event) => {
      if (mobileActionsRef.current && !mobileActionsRef.current.contains(event.target)) {
        setMobileActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [mobileActionsOpen]);

  const fetchSubjects = async () => {
    if (!selectedProgrammeId) {
      setSubjects([]);
      return;
    }
    const { data } = await api.get("/subjects", { params: { programmeId: selectedProgrammeId } });
    setSubjects(data);
  };

  const fetchChapters = async () => {
    const { data } = await api.get("/chapters");
    setChapters(data);
  };

  const fetchChapterStats = async () => {
    const { data } = await api.get("/chapters/stats");
    const mapped = data.reduce((acc, item) => {
      acc[item.chapterId] = item;
      return acc;
    }, {});
    setChapterStats(mapped);
  };

  const fetchCourseContents = async () => {
    if (!selectedProgrammeId) {
      setCourseContents([]);
      return;
    }
    const allItems = [];
    let page = 1;
    let totalPages = 1;
    const pageSize = 500;
    do {
      const { data } = await api.get("/contents", {
        params: {
          programmeId: selectedProgrammeId,
          sort: "chapter",
          page,
          limit: pageSize,
        },
      });
      allItems.push(...(data.items || []));
      totalPages = data.pagination?.totalPages || 1;
      page += 1;
    } while (page <= totalPages);
    setCourseContents(allItems);
  };

  const fetchSubjectUpdates = async ({ silent = false } = {}) => {
    if (!selectedProgrammeId) {
      setSubjectUpdates({});
      setUpdatesAvailable(null);
      return null;
    }
    if (!silent) setUpdatesLoading(true);
    try {
      const { data } = await api.get("/telegram/batch-updates", {
        params: { programmeId: selectedProgrammeId },
      });
      const map = {};
      for (const item of data.subjects || []) {
        map[String(item.subjectId)] = item;
      }
      setSubjectUpdates(map);
      setUpdatesAvailable(data);
      return data;
    } catch (error) {
      if (!silent) {
        toast.error(error.response?.data?.message || "Could not check for updates");
      }
      return null;
    } finally {
      if (!silent) setUpdatesLoading(false);
    }
  };

  const fetchContents = async () => {
    const params = {};
    if (selectedProgrammeId) params.programmeId = selectedProgrammeId;
    if (selectedSubjectId) params.subjectId = selectedSubjectId;
    if (selectedChapterId) params.chapterId = selectedChapterId;
    if (search) params.search = search;
    params.sort = sort;
    params.page = page;
    params.limit = 20;

    const { data } = await api.get("/contents", { params });
    setContents(data.items || []);
    setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
  };

  const fetchProgress = async () => {
    if (!selectedChapterId) {
      setProgress(null);
      return;
    }
    const { data } = await api.get(`/progress/chapter/${selectedChapterId}`);
    setProgress(data);
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSubjects(),
        fetchChapters(),
        fetchChapterStats(),
        fetchContents(),
        fetchCourseContents(),
        fetchProgress(),
        fetchSubjectUpdates({ silent: true }),
      ]);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/programmes", { params: { cdsCycleId: selectedCdsCycleId } });
        if (cancelled) return;
        setProgrammes(data);
        setSelectedProgrammeId((prev) => {
          if (prev && data.some((p) => String(p._id) === String(prev))) return prev;
          return data[0]?._id || "";
        });
      } catch {
        if (!cancelled) setProgrammes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCdsCycleId]);

  useEffect(() => {
    if (!selectedProgrammeId) {
      setSubjects([]);
      setLoading(false);
      return;
    }
    refreshAll();
  }, [selectedProgrammeId]);

  useEffect(() => {
    if (selectedProgrammeId) fetchCourseContents();
  }, [selectedProgrammeId]);

  useEffect(() => {
    setActiveCourseSubjectId("");
    setSubjectUpdates({});
    setUpdatesAvailable(null);
  }, [selectedProgrammeId]);

  useEffect(() => {
    if (!selectedProgrammeId || showLibraryView) return undefined;
    fetchSubjectUpdates({ silent: true });
    const interval = setInterval(() => {
      fetchCourseContents();
      fetchSubjectUpdates({ silent: true });
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedProgrammeId, showLibraryView]);

  const handleUpdateSubject = async (subject) => {
    if (!selectedProgrammeId || !subject?._id) return;
    if (subject.telegramTopicId == null) {
      toast.error("This subject is not linked to Telegram. Re-add it from Add from Telegram.");
      return;
    }
    setUpdatingSubjectId(subject._id);
    setUpdateProgress({
      active: true,
      phase: "syncing",
      percent: 15,
      message: `Updating ${subject.name}…`,
    });
    try {
      const { data } = await api.post("/telegram/update-subject", {
        programmeId: selectedProgrammeId,
        subjectId: subject._id,
      });
      setUpdateProgress({
        active: true,
        phase: "done",
        percent: 100,
        message: data.message || "Subject updated",
      });
      if (data.imported > 0) {
        toast.success(data.message || `Updated — ${data.imported} new lesson(s)`);
      } else {
        toast(data.message || "No new lessons found for this subject", { icon: "ℹ️" });
      }
      await Promise.all([fetchCourseContents(), fetchSubjects(), fetchSubjectUpdates({ silent: true })]);
      setTimeout(() => setUpdateProgress(null), 900);
    } catch (error) {
      setUpdateProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Update failed",
      });
      toast.error(error.response?.data?.message || "Update failed");
    } finally {
      setUpdatingSubjectId("");
    }
  };

  const handleUpdateBatch = async () => {
    if (!selectedProgrammeId) return;

    let status = updatesAvailable;
    if (!status || updatesLoading) {
      status = await fetchSubjectUpdates();
    } else if (!status.available) {
      status = await fetchSubjectUpdates();
    }

    if (!status?.available) {
      toast(status?.reason || "Cannot check updates", { icon: "ℹ️" });
      return;
    }

    const count = status.subjectsWithUpdates || 0;
    if (!count) {
      toast.success("All lessons are up to date");
      return;
    }
    if (
      !window.confirm(
        `Update all ${count} subject${count === 1 ? "" : "s"} with new lessons from Telegram? This may take a few minutes.`
      )
    ) {
      return;
    }
    setBatchUpdating(true);
    setUpdateProgress({
      active: true,
      phase: "syncing",
      percent: 10,
      message: `Updating ${count} subject${count === 1 ? "" : "s"}…`,
    });
    try {
      const { data } = await api.post("/telegram/update-batch", {
        programmeId: selectedProgrammeId,
      });
      setUpdateProgress({
        active: true,
        phase: "done",
        percent: 100,
        message: data.message || "Batch updated",
      });
      toast.success(data.message || "Batch updated");
      await Promise.all([
        fetchCourseContents(),
        fetchSubjects(),
        fetchChapterStats(),
        fetchSubjectUpdates({ silent: true }),
      ]);
      setTimeout(() => setUpdateProgress(null), 1200);
    } catch (error) {
      setUpdateProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Batch update failed",
      });
      toast.error(error.response?.data?.message || "Batch update failed");
    } finally {
      setBatchUpdating(false);
    }
  };

  useEffect(() => {
    fetchContents();
    fetchProgress();
  }, [selectedProgrammeId, selectedSubjectId, selectedChapterId, search, sort, page]);

  useEffect(() => {
    setPage(1);
  }, [selectedSubjectId, selectedChapterId, search, sort]);

  useEffect(() => {
    localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({
        selectedCdsCycleId,
        selectedProgrammeId,
        selectedSubjectId,
        selectedChapterId,
        search,
        sort,
        page,
        expandedSubjectId,
      })
    );
    try {
      window.dispatchEvent(new Event("cds-dashboard-filters-updated"));
    } catch {
      /* ignore */
    }
  }, [selectedCdsCycleId, selectedProgrammeId, selectedSubjectId, selectedChapterId, search, sort, page, expandedSubjectId]);

  useEffect(() => {
    if (!subjects.length) return;
    if (selectedSubjectId && !subjects.some((subject) => subject._id === selectedSubjectId)) {
      setSelectedSubjectId("");
      setSelectedChapterId("");
      setExpandedSubjectId(null);
    }
  }, [subjects, selectedSubjectId]);

  const visibleSubjectIds = useMemo(() => new Set(subjects.map((s) => s._id)), [subjects]);
  const visibleChapters = useMemo(
    () => chapters.filter((chapter) => visibleSubjectIds.has(chapter.subjectId)),
    [chapters, visibleSubjectIds]
  );

  useEffect(() => {
    if (!chapters.length) return;
    if (selectedChapterId && !visibleChapters.some((chapter) => chapter._id === selectedChapterId)) {
      setSelectedChapterId("");
    }
  }, [chapters, selectedChapterId, visibleChapters]);

  useEffect(() => {
    if (!location.state?.refreshCourse) return;
    setShowLibraryView(false);
    setActiveCourseSubjectId("");
    Promise.all([
      fetchSubjects(),
      fetchCourseContents(),
      fetchChapters(),
      fetchProgress(),
      fetchChapterStats(),
      fetchContents(),
      fetchSubjectUpdates({ silent: true }),
    ]).finally(() => {
      navigate(".", { replace: true, state: {} });
    });
  }, [location.state]);

  const selectedSubject = useMemo(
    () => subjects.find((item) => item._id === selectedSubjectId),
    [subjects, selectedSubjectId]
  );

  const selectedChapter = useMemo(
    () => chapters.find((item) => item._id === selectedChapterId),
    [chapters, selectedChapterId]
  );

  const enrichedSubjectUpdates = useMemo(() => {
    const map = { ...subjectUpdates };
    for (const subject of subjects) {
      if (subject.telegramTopicId == null) continue;
      const key = String(subject._id);
      if (!map[key]) {
        map[key] = { subjectId: key, hasUpdate: false, newCount: 0 };
      }
    }
    return map;
  }, [subjectUpdates, subjects]);

  const selectedProgramme = useMemo(
    () => programmes.find((p) => String(p._id) === String(selectedProgrammeId)),
    [programmes, selectedProgrammeId]
  );

  /** Stats scope follows course-view selection, not stale library filters. */
  const dashboardStats = useMemo(() => {
    if (!showLibraryView) {
      let items = courseContents;
      if (activeCourseSubjectId) {
        items = items.filter(
          (c) => String(c.subjectId?._id || c.subjectId) === String(activeCourseSubjectId)
        );
      }
      return {
        totalVideos: items.filter((c) => c.type === "video").length,
        totalPdfs: items.filter((c) => c.type === "pdf").length,
        completedCount: items.filter((c) => c.completed).length,
      };
    }

    if (selectedChapterId) {
      const chapter =
        chapterStats[selectedChapterId] || { totalVideos: 0, totalPdfs: 0, completedCount: 0 };
      return {
        totalVideos: chapter.totalVideos || 0,
        totalPdfs: chapter.totalPdfs || 0,
        completedCount: chapter.completedCount || 0,
      };
    }

    const relevantChapters = visibleChapters.filter(
      (chapter) =>
        !selectedSubjectId || String(chapter.subjectId) === String(selectedSubjectId)
    );
    return relevantChapters.reduce(
      (acc, chapter) => {
        const stats = chapterStats[chapter._id];
        acc.totalVideos += stats?.totalVideos || 0;
        acc.totalPdfs += stats?.totalPdfs || 0;
        acc.completedCount += stats?.completedCount || 0;
        return acc;
      },
      { totalVideos: 0, totalPdfs: 0, completedCount: 0 }
    );
  }, [
    showLibraryView,
    courseContents,
    activeCourseSubjectId,
    selectedChapterId,
    selectedSubjectId,
    visibleChapters,
    chapterStats,
  ]);

  const dashboardScopeLabel = useMemo(() => {
    if (!showLibraryView) {
      if (activeCourseSubjectId) {
        const sub = subjects.find((s) => String(s._id) === String(activeCourseSubjectId));
        return sub?.name || "Subject";
      }
      return selectedProgramme?.name ? `${selectedProgramme.name} · all subjects` : "All subjects";
    }
    if (selectedChapter) return selectedChapter.chapterName;
    return selectedSubject?.name || "All subjects";
  }, [
    showLibraryView,
    activeCourseSubjectId,
    subjects,
    selectedProgramme?.name,
    selectedChapter,
    selectedSubject,
  ]);

  const scopedTotal = dashboardStats.totalVideos + dashboardStats.totalPdfs;
  const appMadeAt = useMemo(() => {
    const allCreatedAt = [...subjects, ...chapters, ...contents]
      .map((item) => item?.createdAt)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()));

    if (!allCreatedAt.length) return null;

    return new Date(Math.min(...allCreatedAt.map((date) => date.getTime())));
  }, [subjects, chapters, contents]);

  const handleCreateProgramme = async (payload) => {
    try {
      const { data: created } = await api.post("/programmes", payload);
      setProgrammeModalOpen(false);
      const { data } = await api.get("/programmes", { params: { cdsCycleId: selectedCdsCycleId } });
      setProgrammes(data);
      setSelectedProgrammeId(created._id);
      toast.success("Coaching batch created");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not create batch");
    }
  };

  const handleDeleteProgramme = async (p) => {
    const subjectCount = subjects.length;
    const message = subjectCount
      ? `Delete coaching batch "${p.name}" and ALL ${subjectCount} subject(s) with their lessons? This cannot be undone.`
      : `Delete coaching batch "${p.name}"?`;
    if (!window.confirm(message)) return;
    try {
      const url = subjectCount ? `/programmes/${p._id}?cascade=true` : `/programmes/${p._id}`;
      await api.delete(url);
      const { data } = await api.get("/programmes", { params: { cdsCycleId: selectedCdsCycleId } });
      setProgrammes(data);
      setSelectedProgrammeId((prev) => {
        if (String(prev) !== String(p._id)) return prev;
        return data[0]?._id || "";
      });
      setActiveCourseSubjectId("");
      await refreshAll();
      toast.success(subjectCount ? "Batch and course data removed" : "Batch removed");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete batch");
    }
  };

  const handleClearCourse = async () => {
    if (!selectedProgrammeId) return;
    const count = subjects.length;
    if (!count) {
      toast.error("No course content to clear");
      return;
    }
    if (
      !window.confirm(
        `Remove ALL ${count} subject(s) and lessons from "${selectedProgramme?.name || "this batch"}"? The batch itself will stay.`
      )
    ) {
      return;
    }
    setClearingCourse(true);
    setUpdateProgress({
      active: true,
      phase: "deleting",
      percent: 15,
      message: "Clearing course…",
    });
    try {
      const { data } = await api.post(`/programmes/${selectedProgrammeId}/clear-course`);
      setUpdateProgress({
        active: true,
        phase: "done",
        percent: 100,
        message: `Cleared ${data.deletedSubjects || count} subject(s)`,
      });
      setActiveCourseSubjectId("");
      await refreshAll();
      toast.success(
        `Cleared ${data.deletedSubjects || count} subject(s) · ${data.deletedContents || 0} lesson(s) removed`
      );
      setTimeout(() => setUpdateProgress(null), 900);
    } catch (error) {
      setUpdateProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Could not clear course",
      });
      toast.error(error.response?.data?.message || "Could not clear course");
    } finally {
      setClearingCourse(false);
    }
  };

  const handleDeleteSubjectById = async (subject) => {
    if (!subject?._id) return;
    if (!window.confirm(`Delete "${subject.name}" and all its lessons?`)) return;
    setDeletingSubjectId(subject._id);
    setUpdateProgress({
      active: true,
      phase: "deleting",
      percent: 20,
      message: `Deleting ${subject.name}…`,
    });
    try {
      await api.delete(`/subjects/${subject._id}`);
      setUpdateProgress({
        active: true,
        phase: "done",
        percent: 100,
        message: "Subject deleted",
      });
      if (activeCourseSubjectId === subject._id) setActiveCourseSubjectId("");
      if (selectedSubjectId === subject._id) {
        setSelectedSubjectId("");
        setSelectedChapterId("");
      }
      await refreshAll();
      toast.success("Subject deleted");
      setTimeout(() => setUpdateProgress(null), 900);
    } catch (error) {
      setUpdateProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Delete failed",
      });
      toast.error(error.response?.data?.message || "Delete failed");
    } finally {
      setDeletingSubjectId("");
    }
  };

  const handleDeleteContentItem = async (item) => {
    if (!item?._id) return;
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setDeletingContentId(item._id);
    try {
      await handleDeleteContent(item._id);
    } finally {
      setDeletingContentId("");
    }
  };

  const handleRenameSubject = async (subject, name) => {
    if (!subject?._id) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === subject.name) return;
    setRenamingSubjectId(subject._id);
    try {
      await api.put(`/subjects/${subject._id}`, { name: trimmed });
      await Promise.all([fetchSubjects(), fetchCourseContents(), fetchChapterStats()]);
      toast.success("Subject renamed");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not rename subject");
      throw error;
    } finally {
      setRenamingSubjectId("");
    }
  };

  const handleRenameContentItem = async (item, title) => {
    if (!item?._id) return;
    try {
      await api.put(`/contents/${item._id}`, { title: title.trim() });
      await Promise.all([fetchContents(), fetchCourseContents(), fetchProgress(), fetchChapterStats()]);
      toast.success("Lesson renamed");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not rename lesson");
      throw error;
    }
  };

  const handleCreateOrUpdateSubject = async (payload) => {
    try {
      if (subjectModal?._id) {
        await api.put(`/subjects/${subjectModal._id}`, payload);
      } else {
        await api.post("/subjects", payload);
      }
      setSubjectModal(null);
      await refreshAll();
      toast.success("Subject saved");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save subject");
    }
  };

  const handleCreateOrUpdateChapter = async (payload) => {
    try {
      if (chapterModal?._id) {
        await api.put(`/chapters/${chapterModal._id}`, payload);
      } else {
        await api.post("/chapters", payload);
      }
      setChapterModal(null);
      await refreshAll();
      toast.success("Chapter saved");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save chapter");
    }
  };

  const newUploadId = () =>
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `up_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  const startProgressPolling = (uploadId, totalFiles) => {
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const { data } = await api.get(`/contents/upload-progress/${uploadId}`);
          if (cancelled) break;
          if (data && data.phase && data.phase !== "idle") {
            setUploadState((prev) => ({
              ...prev,
              active: prev.active,
              phase: data.phase,
              percent: typeof data.percent === "number" ? data.percent : prev.percent,
              bytesLoaded: data.bytesLoaded ?? prev.bytesLoaded,
              bytesTotal: data.bytesTotal ?? prev.bytesTotal,
              bytesPerSecond: data.bytesPerSecond ?? prev.bytesPerSecond,
              compressSpeed: data.compressSpeed ?? prev.compressSpeed,
              fileIndex: data.fileIndex ?? prev.fileIndex,
              filesTotal: data.filesTotal ?? prev.filesTotal ?? totalFiles ?? 1,
              currentFile: data.currentFile ?? prev.currentFile,
              message: data.message ?? prev.message,
              cloudType: data.cloudType ?? prev.cloudType,
              destination: data.destination ?? prev.destination,
              error: data.error ?? null,
            }));
            if (data.phase === "done" || data.phase === "error") return;
          }
        } catch {
          // transient — keep polling
        }
        await new Promise((r) => setTimeout(r, 600));
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  };

  const handleCreateContent = async (payload) => {
    if (payload.flow === "telegram") {
      try {
        const body = new FormData();
        body.append("subjectId", payload.subjectId);
        body.append("chapterId", payload.chapterId);
        body.append("sourceType", "url");
        body.append("videoSourceType", "telegram");
        body.append("title", payload.title);
        body.append("videoUrl", payload.telegramUrl);
        body.append("url", payload.telegramUrl);
        if (payload.autoCreateChapters) body.append("autoCreateChapters", "1");
        if (payload.chapterId) body.append("chapterId", payload.chapterId);
        if (payload.thumbnail) body.append("thumbnail", payload.thumbnail);
        await api.post("/contents", body, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        await Promise.all([fetchContents(), fetchChapters(), fetchProgress(), fetchChapterStats()]);
        toast.success("Content added");
        setContentModalOpen(false);
      } catch (error) {
        const message = error.response?.data?.message || error.message || "Could not add content";
        toast.error(message);
      }
      return;
    }

    if (payload.flow === "url_pdf") {
      try {
        const body = new FormData();
        body.append("subjectId", payload.subjectId);
        body.append("chapterId", payload.chapterId);
        body.append("sourceType", "url");
        body.append("title", payload.title);
        body.append("url", payload.url);
        await api.post("/contents", body, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        await Promise.all([fetchContents(), fetchCourseContents(), fetchProgress(), fetchChapterStats()]);
        toast.success("Content added");
        setContentModalOpen(false);
      } catch (error) {
        const message = error.response?.data?.message || error.message || "Could not add content";
        toast.error(message);
      }
      return;
    }

    const uploadId = newUploadId();
    const isYouTubeDownload = payload.sourceType === "youtube_download";
    const variant = isYouTubeDownload ? "youtube" : "upload";

    setUploadState({
      active: true,
      phase: "pending",
      percent: 0,
      bytesLoaded: 0,
      bytesTotal: 0,
      bytesPerSecond: 0,
      fileIndex: 0,
      filesTotal: payload.files?.length || 1,
      currentFile: payload.files?.[0]?.name || payload.title || null,
      message: "Preparing upload",
      cloudType: null,
      destination: null,
      error: null,
      browserPercent: 0,
      variant,
    });
    const stopPolling = startProgressPolling(uploadId, payload.files?.length || 1);

    try {
      if (payload.sourceType === "upload" && payload.files?.length > 1) {
        const chunkSize = 10;
        const totalFiles = payload.files.length;
        for (let i = 0; i < payload.files.length; i += chunkSize) {
          const chunk = payload.files.slice(i, i + chunkSize);
          const bulkBody = new FormData();
          bulkBody.append("subjectId", payload.subjectId);
          if (payload.chapterId) bulkBody.append("chapterId", payload.chapterId);
          if (payload.titlePrefix) bulkBody.append("titlePrefix", payload.titlePrefix);
          bulkBody.append("uploadId", uploadId);
          if (payload.autoCreateChapters) bulkBody.append("autoCreateChapters", "1");
          chunk.forEach((file) => bulkBody.append("files", file));

          await api.post("/contents/bulk-upload", bulkBody, {
            headers: { "Content-Type": "multipart/form-data" },
            onUploadProgress: (event) => {
              const browserPct = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
              setUploadState((prev) => ({ ...prev, browserPercent: browserPct, filesTotal: totalFiles }));
            },
          });
        }
      } else {
        const body = new FormData();
        body.append("subjectId", payload.subjectId);
        body.append("sourceType", payload.sourceType);
        body.append("uploadId", uploadId);
        if (payload.autoCreateChapters) body.append("autoCreateChapters", "1");
        if (payload.chapterId) body.append("chapterId", payload.chapterId);
        if (payload.sourceType === "upload" && payload.files?.[0]) {
          body.append("title", payload.title || payload.files[0].name);
          body.append("file", payload.files[0]);
        }
        if (payload.sourceType === "url") {
          body.append("title", payload.title);
          body.append("url", payload.url);
        }
        if (payload.sourceType === "youtube_download") {
          if (payload.title) body.append("title", payload.title);
          body.append("url", payload.url);
        }

        await api.post("/contents", body, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (event) => {
            const browserPct = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
            setUploadState((prev) => ({ ...prev, browserPercent: browserPct }));
          },
        });
      }

      setUploadState((prev) => ({
        ...prev,
        active: true,
        phase: "done",
        percent: 100,
        bytesLoaded: prev.bytesTotal || prev.bytesLoaded,
      }));
      setTimeout(() => {
        stopPolling();
        setUploadState((prev) => ({ ...prev, active: false, phase: "idle" }));
        setContentModalOpen(false);
      }, 600);
      await Promise.all([fetchContents(), fetchChapters(), fetchProgress(), fetchChapterStats()]);
      toast.success("Content added");
    } catch (error) {
      stopPolling();
      const message = error.response?.data?.message || error.message || "Could not add content";
      setUploadState((prev) => ({ ...prev, active: false, phase: "idle", error: message }));
      toast.error(message);
    }
  };

  const handleDeleteContent = async (id) => {
    try {
      await api.delete(`/contents/${id}`);
      await Promise.all([fetchContents(), fetchCourseContents(), fetchProgress(), fetchChapterStats()]);
      toast.success("Content deleted");
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    }
  };

  const handleUpdateContent = async (payload) => {
    if (!editingContent?._id) return;
    try {
      await api.put(`/contents/${editingContent._id}`, payload);
      setEditingContent(null);
      await Promise.all([fetchContents(), fetchCourseContents(), fetchProgress(), fetchChapterStats()]);
      toast.success("Content updated");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update content");
    }
  };

  const handleToggleCompleted = async (contentId) => {
    try {
      await api.post(`/progress/toggle/${contentId}`);
      await Promise.all([fetchContents(), fetchCourseContents(), fetchProgress(), fetchChapterStats()]);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update progress");
    }
  };

  const handleDeleteSubject = async () => {
    if (!selectedSubjectId) return;
    try {
      await api.delete(`/subjects/${selectedSubjectId}`);
      setSelectedSubjectId("");
      setSelectedChapterId("");
      await refreshAll();
      toast.success("Subject deleted");
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    }
  };

  const handleDeleteChapter = async () => {
    if (!selectedChapterId) return;
    try {
      await api.delete(`/chapters/${selectedChapterId}`);
      setSelectedChapterId("");
      await Promise.all([fetchContents(), fetchCourseContents(), fetchProgress(), fetchChapterStats()]);
      toast.success("Chapter deleted");
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    }
  };

  const cycleTitle = getCourseById(selectedCdsCycleId).title;
  const completionPercent = scopedTotal
    ? Math.round((dashboardStats.completedCount / scopedTotal) * 100)
    : 0;

  const openTelegramImport = () => {
    if (!selectedProgrammeId) {
      toast.error("Select a coaching batch first");
      return;
    }
    navigate(
      `/import/telegram?programmeId=${encodeURIComponent(selectedProgrammeId)}&programmeName=${encodeURIComponent(selectedProgramme?.name || "")}`
    );
  };

  const headerSubtitle = `${cycleTitle} · ${
    selectedProgramme?.name || "no batch selected"
  } · ${subjects.length} subjects · ${scopedTotal} items`;

  const headerActions = (
    <>
      <button
        type="button"
        className="btn-ghost hidden text-sm sm:inline-flex"
        onClick={() => setSubjectModal({})}
      >
        Subject
      </button>
      <button
        type="button"
        className="btn-ghost hidden text-sm sm:inline-flex"
        onClick={() => setChapterModal({})}
      >
        Chapter
      </button>
      <button
        type="button"
        className="btn-ghost hidden text-sm sm:inline-flex"
        onClick={() => setShowLibraryView((v) => !v)}
      >
        {showLibraryView ? "Course view" : "Library view"}
      </button>
      <div className="relative sm:hidden" ref={mobileActionsRef}>
        <button
          type="button"
          className="btn-ghost p-2.5!"
          aria-label="More actions"
          aria-expanded={mobileActionsOpen}
          onClick={() => setMobileActionsOpen((open) => !open)}
        >
          <FiMoreVertical size={18} />
        </button>
        {mobileActionsOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-[#1a1a1a]">
            <button
              type="button"
              className="flex w-full items-center px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
              onClick={() => {
                setSubjectModal({});
                setMobileActionsOpen(false);
              }}
            >
              Add subject
            </button>
            <button
              type="button"
              className="flex w-full items-center px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
              onClick={() => {
                setChapterModal({});
                setMobileActionsOpen(false);
              }}
            >
              Add chapter
            </button>
            <button
              type="button"
              className="flex w-full items-center px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
              onClick={() => {
                setShowLibraryView((v) => !v);
                setMobileActionsOpen(false);
              }}
            >
              {showLibraryView ? "Course view" : "Library view"}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn-secondary text-sm"
        onClick={openTelegramImport}
        disabled={!selectedProgrammeId}
      >
        <FiUploadCloud size={15} />
        <span className="hidden sm:inline">Add from Telegram</span>
        <span className="sm:hidden">Import</span>
      </button>
      <button
        type="button"
        className="btn-primary text-sm"
        onClick={() => setContentModalOpen(true)}
      >
        <FiPlus size={15} />
        <span className="hidden sm:inline">Add content</span>
        <span className="sm:hidden">New</span>
      </button>
    </>
  );

  return (
    <Layout
      title="Dashboard"
      subtitle={headerSubtitle}
      actions={headerActions}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search content…"
    >
      <div className="space-y-4">
        {/* Metric tiles — first row, matches the reference exactly */}
        <section className="anim-fade-in-up stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Total content",
              value: scopedTotal,
              icon: FiLayers,
              hint: dashboardScopeLabel,
            },
            {
              label: "Videos",
              value: dashboardStats.totalVideos,
              icon: FiPlay,
              hint: dashboardStats.totalVideos === 1 ? "video lesson" : "video lessons",
            },
            {
              label: "PDFs",
              value: dashboardStats.totalPdfs,
              icon: FiFileText,
              hint: dashboardStats.totalPdfs === 1 ? "document" : "documents",
            },
            {
              label: "Completed",
              value: `${completionPercent}%`,
              icon: FiCheckCircle,
              hint: `${dashboardStats.completedCount}/${scopedTotal} items done`,
            },
          ].map(({ label, value, icon: Icon, hint }) => (
            <div
              key={label}
              className="card flex items-center gap-3 p-3.5 transition-shadow duration-200 hover:shadow-md sm:p-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-md ring-1 ring-inset ring-white/10 dark:bg-[#1f1f23] dark:text-slate-100 dark:ring-white/[0.06]">
                <Icon size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {label}
                </p>
                <p className="font-display mt-0.5 truncate text-[22px] leading-tight tabular-nums text-slate-900 dark:text-slate-50">
                  {value}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {hint}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Charts row — Study tracker + Exam countdown */}
        <section className="grid gap-3 lg:grid-cols-2">
          <StudyTracker subjects={subjects} />
          <ExamCountdown activeCourseId={selectedCdsCycleId} />
        </section>

        {/* Coaching batch picker — slim row */}
        <CoachingBatchSection
          selectedCdsCycleId={selectedCdsCycleId}
          onSelectCdsCycle={setSelectedCdsCycleId}
          programmes={programmes}
          selectedProgrammeId={selectedProgrammeId}
          onSelectProgramme={setSelectedProgrammeId}
          onAddBatch={() => setProgrammeModalOpen(true)}
          onDeleteProgramme={handleDeleteProgramme}
          onOpenCloudMappings={() => setCloudMappingModalOpen(true)}
        />

        {/* Chapter progress callout */}
        {progress && (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Chapter progress
              </p>
              <p className="mt-0.5 font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                {progress.completedCount}/{progress.totalCount}{" "}
                <span className="font-sans text-sm font-medium text-slate-500">
                  · {progress.percent}% done
                </span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {progress.totalVideos} videos · {progress.totalPdfs} PDFs
              </p>
            </div>
            <div className="w-full min-w-[180px] flex-1 sm:max-w-xs">
              <div className="progress-bar h-2.5">
                <div
                  className={`progress-bar-fill ${
                    progress.percent >= 100 ? "progress-bar-fill-done" : "progress-bar-fill-default"
                  }`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Course view — subject grid + accordion lessons */}
        {!showLibraryView && selectedProgrammeId && (
          <BatchCourseView
            batchName={selectedProgramme?.name || "Course batch"}
            cycleTitle={cycleTitle}
            subjects={subjects}
            chapters={visibleChapters}
            contents={courseContents}
            activeSubjectId={activeCourseSubjectId}
            onSelectSubject={(subject) => setActiveCourseSubjectId(String(subject._id))}
            onBackToSubjects={() => setActiveCourseSubjectId("")}
            onImportTelegram={openTelegramImport}
            onDeleteSubject={handleDeleteSubjectById}
            onDeleteContent={handleDeleteContentItem}
            onRenameContent={handleRenameContentItem}
            onRenameSubject={handleRenameSubject}
            onClearCourse={handleClearCourse}
            subjectUpdates={enrichedSubjectUpdates}
            updatesLoading={updatesLoading}
            updatesAvailable={updatesAvailable}
            onUpdateBatch={handleUpdateBatch}
            onUpdateSubject={handleUpdateSubject}
            updatingSubjectId={updatingSubjectId}
            batchUpdating={batchUpdating}
            renamingSubjectId={renamingSubjectId}
            deletingSubjectId={deletingSubjectId}
            deletingContentId={deletingContentId}
            clearingCourse={clearingCourse}
          />
        )}

        {/* Admin library view — filters + content cards */}
        {showLibraryView && (
        <>
        {/* Filter bar */}
        <section className="card p-3 sm:p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className="input"
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setSelectedChapterId("");
              }}
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={selectedChapterId}
              onChange={(e) => setSelectedChapterId(e.target.value)}
            >
              <option value="">All chapters</option>
              {visibleChapters
                .filter((chapter) => !selectedSubjectId || chapter.subjectId === selectedSubjectId)
                .map((chapter) => (
                  <option key={chapter._id} value={chapter._id}>
                    {chapter.chapterName}
                  </option>
                ))}
            </select>
            <select
              className="input"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="chapter">Chapter wise</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          {(selectedSubject || selectedChapter) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-800/70">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Managing:{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {selectedChapter?.chapterName || selectedSubject?.name}
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedSubject && (
                  <>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => setSubjectModal(selectedSubject)}
                    >
                      Edit subject
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs hover:bg-rose-50! hover:text-rose-600! dark:hover:bg-rose-900/20!"
                      onClick={handleDeleteSubject}
                    >
                      Delete subject
                    </button>
                  </>
                )}
                {selectedChapter && (
                  <>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => setChapterModal(selectedChapter)}
                    >
                      Edit chapter
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs hover:bg-rose-50! hover:text-rose-600! dark:hover:bg-rose-900/20!"
                      onClick={handleDeleteChapter}
                    >
                      Delete chapter
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Content grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        ) : !contents.length ? (
          <div className="card flex min-h-[260px] flex-col items-center justify-center gap-2 border-dashed text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <FiBookOpen size={20} />
            </span>
            <p className="font-display mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
              Nothing to show yet
            </p>
            <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
              Add a subject, chapter and content to populate this workspace.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => setSubjectModal({})}
              >
                Add subject
              </button>
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => setContentModalOpen(true)}
              >
                Add content
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="anim-fade-in-up stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {contents.map((item) => (
                <ContentCard
                  key={item._id}
                  item={item}
                  onToggleCompleted={handleToggleCompleted}
                  onDelete={handleDeleteContent}
                  onEdit={setEditingContent}
                />
              ))}
            </div>
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <p className="text-slate-500 dark:text-slate-400">
                Page <span className="font-semibold text-slate-700 dark:text-slate-200">{pagination.page}</span>{" "}
                of {pagination.totalPages}{" "}
                <span className="text-slate-400">· {pagination.total} items</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <FiChevronLeft size={15} /> Prev
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                >
                  Next <FiChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
        </>
        )}
      </div>

      {programmeModalOpen && (
        <ProgrammeModal
          cdsCycleId={selectedCdsCycleId}
          onClose={() => setProgrammeModalOpen(false)}
          onSubmit={handleCreateProgramme}
        />
      )}
      {subjectModal && (
        <SubjectModal
          initialValue={subjectModal._id ? subjectModal : null}
          defaultProgrammeId={selectedProgrammeId}
          programmes={programmes}
          onClose={() => setSubjectModal(null)}
          onSubmit={handleCreateOrUpdateSubject}
        />
      )}
      {chapterModal && (
        <ChapterModal
          subjects={subjects}
          initialValue={chapterModal._id ? chapterModal : null}
          onClose={() => setChapterModal(null)}
          onSubmit={handleCreateOrUpdateChapter}
        />
      )}
      {contentModalOpen && (
        <ContentModal
          subjects={subjects}
          chapters={visibleChapters}
          selectedSubjectId={selectedSubjectId}
          selectedChapterId={selectedChapterId}
          onClose={() => setContentModalOpen(false)}
          onSubmit={handleCreateContent}
          uploadState={uploadState}
        />
      )}
      {editingContent && (
        <ContentEditModal
          content={editingContent}
          subjects={subjects}
          chapters={visibleChapters}
          onClose={() => setEditingContent(null)}
          onSubmit={handleUpdateContent}
        />
      )}
      {cloudMappingModalOpen && (
        <CloudMappingModal
          onClose={() => setCloudMappingModalOpen(false)}
        />
      )}
      <OperationProgressOverlay
        progress={updateProgress}
        onDismiss={() => setUpdateProgress(null)}
      />
    </Layout>
  );
};

export default DashboardPage;
