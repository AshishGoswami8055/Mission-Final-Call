import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiFileText,
  FiLoader,
  FiLogOut,
  FiPlay,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import Layout from "../components/Layout";
import OperationProgressOverlay from "../components/OperationProgressOverlay";
import { buildTelegramPreviewStreamUrl, formatTelegramMediaMeta } from "../utils/media";
import {
  buildSelectedItemsFromPlans,
  countSelectedLessonsInPlan,
  orderedMediaForTopic,
  suggestLessonTitle,
  syncLessonPlanForTopic,
} from "../utils/telegramLessonPlan";
import { createUploadId, waitForUploadProgress } from "../utils/uploadProgress";

const mediaDisplayName = (item) => item?.displayName || item?.fileName || "Untitled";

const DEFAULT_TOPIC_MEDIA_PREFS = { includeVideos: true, includePdfs: true };

const topicMediaPrefKey = (topicId) => String(topicId);

const topicInCourse = (topic) => Boolean(topic?.inCourse ?? topic?.importedCount > 0);

const topicStatus = (topic) => {
  const inCourse = topicInCourse(topic);
  if (inCourse && topic.newCount === 0) return "upToDate";
  if (topic.newCount > 0 && inCourse) return "hasUpdates";
  if (topic.newCount > 0) return "new";
  if (inCourse) return "upToDate";
  return "notInCourse";
};

const TelegramImportPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const programmeId = params.get("programmeId") || "";
  const programmeName = params.get("programmeName") || "Course batch";

  const [session, setSession] = useState({ connected: false, phone: null });
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [channels, setChannels] = useState([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(null);

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [topicMediaLoading, setTopicMediaLoading] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [selectedToAddIds, setSelectedToAddIds] = useState(new Set());
  const [topicMediaPrefs, setTopicMediaPrefs] = useState({});
  const [topicLessonPlans, setTopicLessonPlans] = useState({});
  const [topicSearch, setTopicSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [previewFile, setPreviewFile] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [mobilePanel, setMobilePanel] = useState("topics");

  const loadSession = useCallback(async () => {
    const { data } = await api.get("/telegram/session");
    setSession(data);
  }, []);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const { data } = await api.get("/telegram/channels", {
        params: programmeId ? { programmeId } : undefined,
      });
      setChannels(data.channels || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load channels");
    } finally {
      setChannelsLoading(false);
    }
  }, [programmeId]);

  const loadPreview = useCallback(async () => {
    if (!selectedChannel?.id) return;
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const { data } = await api.get("/telegram/forum-preview", {
        params: {
          channelId: selectedChannel.id,
          ...(programmeId ? { programmeId } : {}),
        },
        timeout: 180000,
      });
      setPreview(data);
      const topics = data.topics || [];
      if (!topics.length) {
        setPreviewError("No subjects were returned for this channel. Try Refresh subjects below.");
      }
      setSelectedToAddIds(new Set());
      const prefs = {};
      for (const topic of topics) {
        prefs[topicMediaPrefKey(topic.id)] = {
          includeVideos: topic.importVideos !== false,
          includePdfs: topic.importPdfs !== false,
        };
      }
      setTopicMediaPrefs(prefs);
      setTopicLessonPlans({});
      setSelectedTopicId(topics[0]?.id ?? null);
      setPreviewFile(null);
      setMediaFilter("all");
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message || "Could not load subjects";
      setPreview(null);
      setPreviewError(message);
      if (status === 524 || status === 504) {
        toast.error(
          "Telegram preview timed out. Click Refresh subjects, or use localhost for large channels."
        );
      } else if (error.code === "ECONNABORTED") {
        toast.error("Loading subjects timed out. Click Refresh subjects to try again.");
      } else {
        toast.error(message);
      }
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedChannel?.id, programmeId]);

  const loadTopicMedia = useCallback(
    async (topicId) => {
      if (!selectedChannel?.id || !topicId) return;
      const topic = preview?.topics?.find((row) => row.id === topicId);
      if (!topic || topic.mediaLoaded) return;

      setTopicMediaLoading(true);
      try {
        const { data } = await api.get("/telegram/topic-media", {
          params: {
            channelId: selectedChannel.id,
            topicId,
            ...(programmeId ? { programmeId } : {}),
          },
          timeout: 120000,
        });
        setPreview((prev) => {
          if (!prev?.topics) return prev;
          const topics = prev.topics.map((row) =>
            row.id === topicId
              ? {
                  ...row,
                  media: data.media || [],
                  mediaCount: data.mediaCount ?? row.mediaCount,
                  importedCount: data.importedCount ?? row.importedCount,
                  inCourse: data.inCourse ?? row.inCourse,
                  newCount: data.newCount ?? row.newCount,
                  mediaLoaded: true,
                }
              : row
          );
          const totalNew = topics.reduce((sum, row) => sum + (row.newCount || 0), 0);
          return { ...prev, topics, totalNew };
        });
      } catch (error) {
        const status = error.response?.status;
        if (status === 524 || status === 504) {
          toast.error("Loading lessons timed out. Try again or use localhost.");
        } else {
          toast.error(error.response?.data?.message || "Could not load lessons for this subject");
        }
      } finally {
        setTopicMediaLoading(false);
      }
    },
    [preview?.topics, selectedChannel?.id, programmeId]
  );

  useEffect(() => {
    loadSession().catch(() => {});
  }, [loadSession]);

  useEffect(() => {
    if (session.connected) loadChannels();
  }, [session.connected, loadChannels]);

  useEffect(() => {
    if (selectedChannel) loadPreview();
  }, [selectedChannel, loadPreview]);

  useEffect(() => {
    if (selectedTopicId) loadTopicMedia(selectedTopicId);
  }, [selectedTopicId, loadTopicMedia]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await api.post("/telegram/login", { phone: phone.trim() });
      toast.success("OTP sent");
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const { data } = await api.post("/telegram/verify-otp", { phone: phone.trim(), code: otp.trim() });
      if (data.needsPassword) {
        setNeedsPassword(true);
        return;
      }
      setSession({ connected: true, phone: data.phone || phone.trim() });
      toast.success("Connected");
    } catch (error) {
      toast.error(error.response?.data?.message || "OTP failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyPassword = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await api.post("/telegram/verify-password", { phone: phone.trim(), password });
      setSession({ connected: true, phone: phone.trim() });
      toast.success("Connected");
    } catch (error) {
      toast.error(error.response?.data?.message || "2FA failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const filteredTopics = useMemo(
    () =>
      preview?.topics?.filter((t) =>
        t.title.toLowerCase().includes(topicSearch.trim().toLowerCase())
      ) || [],
    [preview?.topics, topicSearch]
  );

  const activeTopic = preview?.topics?.find((t) => t.id === selectedTopicId);

  const stats = useMemo(() => {
    const topics = preview?.topics || [];
    return {
      total: topics.length,
      inCourse: topics.filter((t) => topicInCourse(t)).length,
      totalNew: preview?.totalNew ?? 0,
      notInCourse: topics.filter((t) => !topicInCourse(t)).length,
      withUpdates: topics.filter((t) => t.newCount > 0 && topicInCourse(t)).length,
    };
  }, [preview]);

  const getTopicMediaPref = useCallback(
    (topicId) => topicMediaPrefs[topicMediaPrefKey(topicId)] || DEFAULT_TOPIC_MEDIA_PREFS,
    [topicMediaPrefs]
  );

  const activeTopicPrefs = activeTopic ? getTopicMediaPref(activeTopic.id) : DEFAULT_TOPIC_MEDIA_PREFS;

  const activeLessonPlan = activeTopic
    ? topicLessonPlans[topicMediaPrefKey(activeTopic.id)]
    : null;

  const filteredMedia = useMemo(
    () =>
      orderedMediaForTopic({
        media: activeTopic?.media || [],
        plan: activeLessonPlan,
        prefs: activeTopicPrefs,
        mediaFilter,
      }),
    [activeTopic?.media, activeLessonPlan, activeTopicPrefs, mediaFilter]
  );

  const selectableMediaInView = useMemo(
    () => filteredMedia.filter((row) => !row.imported),
    [filteredMedia]
  );

  const mediaCounts = useMemo(() => {
    const media = activeTopic?.media || [];
    return {
      all: media.length,
      video: media.filter((m) => m.mediaType === "video").length,
      pdf: media.filter((m) => m.mediaType === "pdf").length,
    };
  }, [activeTopic?.media]);

  const openPreview = (item, topic) => {
    setPreviewFile({
      topicId: topic.id,
      messageId: item.messageId,
      mediaType: item.mediaType,
      fileName: mediaDisplayName(item),
      displayName: mediaDisplayName(item),
      topicTitle: topic.title,
    });
  };

  const previewStreamUrl =
    previewFile && selectedChannel?.id
      ? buildTelegramPreviewStreamUrl(selectedChannel.id, previewFile.messageId)
      : "";

  const toggleAddSelection = (topicId, checked) => {
    setSelectedToAddIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(topicId);
      else next.delete(topicId);
      return next;
    });
  };

  const addableTopicIds = useMemo(
    () => (preview?.topics || []).filter((topic) => !topicInCourse(topic)).map((topic) => topic.id),
    [preview?.topics]
  );

  const selectAllAddableSubjects = () => {
    setSelectedToAddIds(new Set(addableTopicIds));
  };

  const unselectAllAddableSubjects = () => {
    setSelectedToAddIds(new Set());
  };

  const setTopicMediaPref = (topicId, field, value) => {
    setTopicMediaPrefs((prev) => ({
      ...prev,
      [topicMediaPrefKey(topicId)]: {
        ...getTopicMediaPref(topicId),
        [field]: value,
      },
    }));
  };

  const buildTopicMediaPrefsPayload = (topicIds) => {
    const payload = {};
    for (const id of topicIds) {
      payload[String(id)] = getTopicMediaPref(id);
    }
    return payload;
  };

  const countImportableMedia = (topic, prefs = null) => {
    const media = topic?.media || [];
    const p = prefs || getTopicMediaPref(topic?.id);
    return media.filter(
      (m) =>
        (m.mediaType === "video" && p.includeVideos) || (m.mediaType === "pdf" && p.includePdfs)
    ).length;
  };

  const validateTopicMediaPrefs = (topicIds) => {
    const missingType = topicIds.filter((id) => {
      const p = getTopicMediaPref(id);
      return !p.includeVideos && !p.includePdfs;
    });
    if (missingType.length) {
      toast.error("Select at least videos or PDFs for each subject");
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!activeTopic?.mediaLoaded || !activeTopic?.media?.length) return;
    const prefs = getTopicMediaPref(activeTopic.id);
    setTopicLessonPlans((prev) => {
      const key = topicMediaPrefKey(activeTopic.id);
      const next = syncLessonPlanForTopic(activeTopic.media, prefs, prev[key]);
      const prevPlan = prev[key];
      if (JSON.stringify(prevPlan) === JSON.stringify(next)) return prev;
      return { ...prev, [key]: next };
    });
  }, [activeTopic?.id, activeTopic?.mediaLoaded, activeTopic?.media, getTopicMediaPref, topicMediaPrefs]);

  const setLessonSelected = (topicId, messageId, selected) => {
    setTopicLessonPlans((prev) => {
      const key = topicMediaPrefKey(topicId);
      const plan = prev[key];
      if (!plan?.entries[messageId]) return prev;
      return {
        ...prev,
        [key]: {
          ...plan,
          entries: {
            ...plan.entries,
            [messageId]: { ...plan.entries[messageId], selected },
          },
        },
      };
    });
  };

  const setLessonDisplayName = (topicId, messageId, displayName) => {
    setTopicLessonPlans((prev) => {
      const key = topicMediaPrefKey(topicId);
      const plan = prev[key];
      if (!plan?.entries[messageId]) return prev;
      return {
        ...prev,
        [key]: {
          ...plan,
          entries: {
            ...plan.entries,
            [messageId]: { ...plan.entries[messageId], displayName },
          },
        },
      };
    });
  };

  const moveLessonInPlan = (topicId, messageId, direction) => {
    setTopicLessonPlans((prev) => {
      const key = topicMediaPrefKey(topicId);
      const plan = prev[key];
      if (!plan) return prev;
      const idx = plan.order.indexOf(messageId);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= plan.order.length) return prev;
      const order = [...plan.order];
      [order[idx], order[target]] = [order[target], order[idx]];
      return { ...prev, [key]: { ...plan, order } };
    });
  };

  const setAllLessonsSelected = (topicId, selected) => {
    const topic = preview?.topics?.find((row) => row.id === topicId);
    const prefs = getTopicMediaPref(topicId);
    if (!topic?.media?.length) return;
    setTopicLessonPlans((prev) => {
      const key = topicMediaPrefKey(topicId);
      const plan = syncLessonPlanForTopic(topic.media, prefs, prev[key]);
      const entries = { ...plan.entries };
      for (const id of plan.order) {
        entries[id] = { ...entries[id], selected };
      }
      return { ...prev, [key]: { ...plan, entries } };
    });
  };

  const allTopicsHaveLessonPlans = (topicIds) =>
    topicIds.every((id) => {
      const topic = preview?.topics?.find((row) => row.id === id);
      return topic?.mediaLoaded && topicLessonPlans[topicMediaPrefKey(id)];
    });

  const runWithProgressTick = (phase, startPercent, endPercent, intervalMs = 400) => {
    let current = startPercent;
    const timer = setInterval(() => {
      current = Math.min(endPercent - 2, current + 3);
      setProgress((prev) => (prev?.active ? { ...prev, percent: current } : prev));
    }, intervalMs);
    return () => clearInterval(timer);
  };

  const finishAndRefresh = async (message) => {
    setProgress({ active: true, phase: "done", percent: 100, message });
    toast.success(message);
    await loadPreview();
    setTimeout(() => {
      navigate("/", { state: { refreshCourse: true } });
    }, 1200);
  };

  /** Download new lessons for subjects already in the course. */
  const handleDownloadNew = async (topicIds = null) => {
    if (!programmeId) {
      toast.error("Select a batch on the dashboard first");
      return;
    }
    if (topicIds?.length && !validateTopicMediaPrefs(topicIds)) {
      return;
    }
    setBusy(true);
    setProgress({
      active: true,
      phase: "syncing",
      percent: 10,
      message: "Downloading new lessons…",
    });
    const stopTick = runWithProgressTick("syncing", 10, 95);
    try {
      if (topicIds?.length === 1) {
        const subjectRes = await api.get("/subjects", { params: { programmeId } });
        const subject = (subjectRes.data || []).find(
          (s) => Number(s.telegramTopicId) === Number(topicIds[0])
        );
        if (!subject) {
          throw new Error("Subject not found in course");
        }
        const prefs = getTopicMediaPref(topicIds[0]);
        const { data } = await api.post("/telegram/update-subject", {
          programmeId,
          subjectId: subject._id,
          includeVideos: prefs.includeVideos,
          includePdfs: prefs.includePdfs,
        });
        stopTick();
        await finishAndRefresh(data.message || "Downloaded new lessons");
        return;
      }

      const { data } = await api.post("/telegram/update-batch", { programmeId });
      stopTick();
      await finishAndRefresh(data.message || `Downloaded ${data.imported || 0} new lesson(s)`);
    } catch (error) {
      stopTick();
      setProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Download failed",
      });
      toast.error(error.response?.data?.message || "Download failed");
    } finally {
      setBusy(false);
    }
  };

  /** Add new subjects (not yet in course) from Telegram. */
  const handleAddSubjects = async (topicIdsOverride = null) => {
    if (!selectedChannel?.id || !programmeId) {
      toast.error("Select a batch on the dashboard first");
      return;
    }

    const topicIds = topicIdsOverride?.length
      ? topicIdsOverride
      : [...selectedToAddIds].filter((id) => {
          const t = preview?.topics?.find((x) => x.id === id);
          return t && !topicInCourse(t);
        });

    if (!topicIds.length) {
      toast.error("Select at least one subject to add");
      return;
    }
    if (!validateTopicMediaPrefs(topicIds)) {
      return;
    }

    const selectedItems = buildSelectedItemsFromPlans(
      topicIds,
      preview?.topics,
      topicLessonPlans,
      topicMediaPrefKey
    );
    const useCuratedImport = selectedItems.length > 0 && allTopicsHaveLessonPlans(topicIds);

    if (allTopicsHaveLessonPlans(topicIds) && selectedItems.length === 0) {
      toast.error("Select at least one lesson to import");
      return;
    }

    const uploadId = createUploadId();
    setBusy(true);
    setProgress({
      active: true,
      phase: "importing",
      percent: 5,
      message: `Adding ${topicIds.length} subject(s) to your course…`,
    });

    let progressWait = null;
    try {
      const applyProgress = (data) => {
        setProgress({
          active: true,
          phase: data.phase || "importing",
          percent: Math.min(99, Number(data.percent) || 5),
          message: data.message || "Adding subjects…",
          currentFile: data.currentFile,
        });
      };

      progressWait = waitForUploadProgress(uploadId, applyProgress);

      const importBody = {
        channelId: selectedChannel.id,
        channelTitle: selectedChannel.title,
        programmeId,
        importAll: false,
        useForumTopics: true,
        topicIds,
        topicMediaPrefs: buildTopicMediaPrefsPayload(topicIds),
        autoSync: true,
        uploadId,
        pruneUnselectedTopics: false,
      };
      if (useCuratedImport) {
        importBody.selectedItems = selectedItems;
      }

      const response = await api.post("/telegram/import-batch", importBody);

      if (response.status === 202) {
        const result = await progressWait;
        await finishAndRefresh(
          result.message ||
            `Added ${topicIds.length} subject(s) to your course`
        );
      } else {
        progressWait.cancel();
        const { data } = response;
        await finishAndRefresh(
          `Added ${data.imported || 0} lesson(s) from ${topicIds.length} subject(s)`
        );
      }
    } catch (error) {
      if (progressWait) progressWait.cancel();
      setProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Could not add subjects",
      });
      toast.error(error.response?.data?.message || "Could not add subjects");
    } finally {
      setBusy(false);
    }
  };

  const handleClearCourse = async () => {
    if (!programmeId) return;
    if (
      !window.confirm(
        "Remove all subjects and lessons from this batch? The batch name will stay. You can add subjects again from Telegram."
      )
    ) {
      return;
    }

    setBusy(true);
    setProgress({
      active: true,
      phase: "deleting",
      percent: 8,
      message: "Clearing course…",
    });
    const stopTick = runWithProgressTick("deleting", 8, 92);

    try {
      const { data } = await api.post(`/programmes/${programmeId}/clear-course`);
      stopTick();
      setProgress({
        active: true,
        phase: "done",
        percent: 100,
        message: `Removed ${data.deletedSubjects || 0} subject(s)`,
      });
      toast.success("Course cleared");
      await loadPreview();
      setTimeout(() => setProgress(null), 1200);
    } catch (error) {
      stopTick();
      setProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Clear failed",
      });
      toast.error(error.response?.data?.message || "Clear failed");
    } finally {
      setBusy(false);
    }
  };

  const dismissProgress = () => setProgress(null);

  const addableSelectedCount = [...selectedToAddIds].filter((id) => {
    const t = preview?.topics?.find((x) => x.id === id);
    return t && !topicInCourse(t);
  }).length;

  const activeImportableCount = activeTopic
    ? activeLessonPlan && activeTopic.mediaLoaded
      ? countSelectedLessonsInPlan(activeLessonPlan)
      : countImportableMedia(activeTopic, activeTopicPrefs)
    : 0;

  const StatusBadge = ({ topic }) => {
    const status = topicStatus(topic);
    if (status === "upToDate") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Up to date
        </span>
      );
    }
    if (status === "hasUpdates" || status === "new") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400 ring-2 ring-amber-200 dark:ring-amber-900" />
          {topic.newCount} new
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
        Not in course
      </span>
    );
  };

  return (
    <Layout
      title="Add content from Telegram"
      subtitle={`${programmeName} · Pick subjects once — new lessons download automatically`}
      actions={
        <Link to="/" className="btn-secondary text-sm">
          <FiArrowLeft size={14} /> Dashboard
        </Link>
      }
    >
      <OperationProgressOverlay
        progress={progress}
        onDismiss={progress?.phase === "error" ? dismissProgress : undefined}
      />

      <div className="space-y-4">
        {!session.connected ? (
          <div className="card mx-auto max-w-lg p-6">
            <h2 className="text-lg font-semibold">Connect Telegram</h2>
            <p className="mt-1 text-sm text-slate-500">
              Log in separately on localhost and on production — each server needs its own Telegram login for videos to play.
            </p>
            {!needsPassword ? (
              <form className="mt-4 space-y-3" onSubmit={otp ? handleVerifyOtp : handleLogin}>
                <input className="input" type="tel" placeholder="+91XXXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                {phone && <input className="input" placeholder="OTP code" value={otp} onChange={(e) => setOtp(e.target.value)} />}
                <button type="submit" className="btn-primary w-full" disabled={authLoading}>
                  {authLoading ? <FiLoader className="animate-spin" /> : <FiSend size={14} />}
                  {otp ? "Verify OTP" : "Send OTP"}
                </button>
              </form>
            ) : (
              <form className="mt-4 space-y-3" onSubmit={handleVerifyPassword}>
                <input className="input" type="password" placeholder="2FA password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="submit" className="btn-primary w-full" disabled={authLoading}>Verify</button>
              </form>
            )}
          </div>
        ) : (
          <>
            {!selectedChannel && (
              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    Logged in as {session.phone}
                    {session.deploymentKey ? ` · ${session.deploymentKey}` : ""}
                  </p>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() =>
                      api.post("/telegram/logout").then(() => {
                        setSession({ connected: false });
                        toast.success("Logged out");
                      })
                    }
                  >
                    <FiLogOut size={12} /> Logout
                  </button>
                </div>
                <h2 className="font-semibold">Choose your Telegram channel</h2>
                {channelsLoading ? (
                  <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {channels.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-500 dark:border-slate-700"
                        onClick={() => setSelectedChannel(ch)}
                      >
                        {ch.photo ? (
                          <img src={ch.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700">TG</div>
                        )}
                        <span className="truncate font-medium">{ch.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedChannel && (
              <div className="flex min-h-[50vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white sm:min-h-[70vh] dark:border-slate-800 dark:bg-[#1a1a1a]">
                <div className="border-b border-slate-200 px-3 py-3 sm:px-4 dark:border-slate-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                      <button
                        type="button"
                        className="btn-ghost text-sm"
                        disabled={busy}
                        onClick={() => {
                          setSelectedChannel(null);
                          setPreview(null);
                          setMobilePanel("topics");
                        }}
                      >
                        <FiArrowLeft size={14} /> Channels
                      </button>
                      <span className="truncate font-semibold">{selectedChannel.title}</span>
                      {preview && !previewLoading && (
                        <span className="text-xs text-slate-500">
                          {stats.inCourse} in course · {stats.totalNew} new lesson{stats.totalNew === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        className="btn-ghost w-full text-sm sm:w-auto"
                        disabled={busy || previewLoading || !selectedChannel}
                        onClick={() => loadPreview()}
                      >
                        <FiRefreshCw size={14} className={previewLoading ? "animate-spin" : ""} />
                        Refresh subjects
                      </button>
                      {stats.totalNew > 0 && (
                        <button
                          type="button"
                          className="btn-primary w-full text-sm sm:w-auto"
                          disabled={busy || !programmeId}
                          onClick={() => handleDownloadNew()}
                        >
                          <FiRefreshCw size={14} className={busy ? "animate-spin" : ""} />
                          <span className="truncate">Download new ({stats.totalNew})</span>
                        </button>
                      )}
                      {addableSelectedCount > 0 && (
                        <button
                          type="button"
                          className="btn-secondary w-full text-sm sm:w-auto"
                          disabled={
                            busy ||
                            !programmeId ||
                            [...selectedToAddIds].some((id) => {
                              const t = preview?.topics?.find((x) => x.id === id);
                              if (!t || topicInCourse(t)) return false;
                              const p = getTopicMediaPref(id);
                              return !p.includeVideos && !p.includePdfs;
                            })
                          }
                          onClick={() => handleAddSubjects()}
                        >
                          {busy ? (
                            <FiLoader size={14} className="animate-spin" />
                          ) : (
                            <FiUploadCloud size={14} />
                          )}
                          Add to course ({addableSelectedCount})
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-400">
                    <strong className="font-semibold text-slate-800 dark:text-slate-200">How it works:</strong>{" "}
                    Check the subjects you want, then click <em>Add to course</em>. Use{" "}
                    <em>Select all</em> or <em>Unselect all</em> in the list — nothing is checked by default. After
                    import, new Telegram uploads sync automatically.
                  </p>
                  {preview?.channelMode === "flat" && (
                    <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200">
                      This channel has no forum topics — subjects are grouped from PDF captions (Topic / Batch fields).
                    </p>
                  )}
                </div>

                <div className="flex justify-end border-b border-slate-100 px-4 py-2 dark:border-slate-800">
                  {programmeId && (
                    <button
                      type="button"
                      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
                      disabled={busy}
                      onClick={handleClearCourse}
                    >
                      {busy ? <FiLoader size={12} className="inline animate-spin" /> : null}{" "}
                      Remove all subjects from this batch
                    </button>
                  )}
                </div>

                {previewLoading ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-slate-400">
                    <FiLoader className="animate-spin" size={24} />
                    <p className="text-sm">Loading subjects…</p>
                  </div>
                ) : (
                  <div className="grid flex-1 lg:grid-cols-[minmax(240px,300px)_1fr]">
                    <div
                      className={`border-b border-slate-200 lg:border-r lg:border-b-0 dark:border-slate-800 ${
                        mobilePanel === "detail" ? "hidden lg:block" : "block"
                      }`}
                    >
                      <div className="space-y-2 border-b border-slate-100 p-3 dark:border-slate-800">
                        <div className="relative">
                          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                          <input
                            className="input pl-9 text-sm"
                            placeholder="Search subjects…"
                            value={topicSearch}
                            onChange={(e) => setTopicSearch(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-slate-500">
                          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-200 align-middle dark:bg-emerald-800" />{" "}
                          Green = already in this batch · check others to add to this course
                        </p>
                        {addableTopicIds.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="btn-ghost text-xs"
                              disabled={busy || addableSelectedCount >= addableTopicIds.length}
                              onClick={selectAllAddableSubjects}
                            >
                              Select all ({addableTopicIds.length})
                            </button>
                            <button
                              type="button"
                              className="btn-ghost text-xs"
                              disabled={busy || addableSelectedCount === 0}
                              onClick={unselectAllAddableSubjects}
                            >
                              Unselect all
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="max-h-[50vh] overflow-y-auto lg:max-h-[60vh]">
                        {filteredTopics.map((topic) => {
                          const isActive = selectedTopicId === topic.id;
                          const canAdd = !topicInCourse(topic);
                          const inCourse = topicInCourse(topic);
                          const isChecked = selectedToAddIds.has(topic.id);
                          const rowClass = inCourse
                            ? isActive
                              ? "border-l-4 border-emerald-500 bg-emerald-100/90 dark:border-emerald-400 dark:bg-emerald-950/50"
                              : "border-l-4 border-emerald-400/80 bg-emerald-50/80 dark:border-emerald-600 dark:bg-emerald-950/25"
                            : isActive
                              ? "border-l-4 border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/30"
                              : "border-l-4 border-transparent hover:bg-slate-50 dark:hover:bg-white/3";
                          return (
                            <div
                              key={topic.id}
                              className={`flex items-start gap-2 border-b border-slate-100 px-3 py-3 transition dark:border-slate-800/80 ${rowClass}`}
                            >
                              {canAdd ? (
                                <input
                                  type="checkbox"
                                  className="mt-1 shrink-0"
                                  checked={isChecked}
                                  disabled={busy}
                                  onChange={(e) => toggleAddSelection(topic.id, e.target.checked)}
                                />
                              ) : (
                                <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center text-emerald-600">
                                  <FiCheck size={14} />
                                </span>
                              )}
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => {
                                  setSelectedTopicId(topic.id);
                                  setMobilePanel("detail");
                                }}
                              >
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium text-slate-800 dark:text-slate-100">{topic.title}</span>
                                  {inCourse && (
                                    <span className="rounded bg-emerald-600/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                                      In batch
                                    </span>
                                  )}
                                </span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-2">
                                  <StatusBadge topic={topic} />
                                  <span className="text-xs text-slate-400">
                                    {topic.mediaCount} lesson{topic.mediaCount === 1 ? "" : "s"}
                                  </span>
                                </span>
                              </button>
                            </div>
                          );
                        })}
                        {!filteredTopics.length && (
                          <div className="p-6 text-center text-sm text-slate-400">
                            {previewError ? (
                              <>
                                <p className="text-rose-600 dark:text-rose-400">{previewError}</p>
                                <button
                                  type="button"
                                  className="btn-secondary mt-3 text-xs"
                                  disabled={previewLoading}
                                  onClick={() => loadPreview()}
                                >
                                  <FiRefreshCw size={12} className={previewLoading ? "animate-spin" : ""} /> Try again
                                </button>
                              </>
                            ) : preview ? (
                              "No subjects found in this channel."
                            ) : (
                              "Subjects could not be loaded. Click Refresh subjects above."
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className={`max-h-[60vh] overflow-y-auto p-3 sm:p-4 ${
                        mobilePanel === "topics" ? "hidden lg:block" : "block"
                      }`}
                    >
                      {activeTopic ? (
                        <>
                          <button
                            type="button"
                            className="btn-ghost mb-3 text-sm lg:hidden"
                            onClick={() => setMobilePanel("topics")}
                          >
                            <FiArrowLeft size={14} /> All subjects
                          </button>
                          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                            <div>
                              <h3 className="text-base font-semibold sm:text-lg">{activeTopic.title}</h3>
                              <div className="mt-1">
                                <StatusBadge topic={activeTopic} />
                              </div>
                            </div>
                            {activeTopic.newCount > 0 && topicInCourse(activeTopic) && (
                              <button
                                type="button"
                                className="btn-primary text-xs"
                                disabled={
                                  busy ||
                                  !programmeId ||
                                  (!activeTopicPrefs.includeVideos && !activeTopicPrefs.includePdfs)
                                }
                                onClick={() => handleDownloadNew([activeTopic.id])}
                              >
                                {busy ? (
                                  <FiLoader size={12} className="animate-spin" />
                                ) : (
                                  <FiRefreshCw size={12} />
                                )}{" "}
                                Download {activeTopic.newCount} new
                              </button>
                            )}
                            {!topicInCourse(activeTopic) && (
                              <button
                                type="button"
                                className="btn-secondary text-xs"
                                disabled={
                                  busy ||
                                  !programmeId ||
                                  (!activeTopicPrefs.includeVideos && !activeTopicPrefs.includePdfs) ||
                                  (activeTopic.mediaLoaded && activeImportableCount === 0)
                                }
                                onClick={() => handleAddSubjects([activeTopic.id])}
                              >
                                {busy ? (
                                  <FiLoader size={12} className="animate-spin" />
                                ) : (
                                  <FiUploadCloud size={12} />
                                )}{" "}
                                Add to course
                              </button>
                            )}
                          </div>

                          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Import to course
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Choose videos, PDFs, or both. Future &quot;Download new&quot; syncs use the same choice.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-4">
                              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input
                                  type="checkbox"
                                  className="shrink-0"
                                  checked={activeTopicPrefs.includeVideos}
                                  disabled={
                                    busy ||
                                    (!activeTopicPrefs.includePdfs && activeTopicPrefs.includeVideos)
                                  }
                                  onChange={(e) =>
                                    setTopicMediaPref(activeTopic.id, "includeVideos", e.target.checked)
                                  }
                                />
                                <FiPlay size={14} className="text-teal-600" />
                                Videos ({mediaCounts.video})
                              </label>
                              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input
                                  type="checkbox"
                                  className="shrink-0"
                                  checked={activeTopicPrefs.includePdfs}
                                  disabled={
                                    busy ||
                                    (!activeTopicPrefs.includeVideos && activeTopicPrefs.includePdfs)
                                  }
                                  onChange={(e) =>
                                    setTopicMediaPref(activeTopic.id, "includePdfs", e.target.checked)
                                  }
                                />
                                <FiFileText size={14} className="text-teal-600" />
                                PDFs ({mediaCounts.pdf})
                              </label>
                            </div>
                            {!activeTopicPrefs.includeVideos && !activeTopicPrefs.includePdfs && (
                              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                                Select at least one type to import.
                              </p>
                            )}
                            {activeTopic.mediaLoaded && activeImportableCount > 0 && (
                              <p className="mt-2 text-xs text-slate-500">
                                Will import {activeImportableCount} selected lesson
                                {activeImportableCount === 1 ? "" : "s"} in the order shown below.
                              </p>
                            )}
                            {activeTopic.mediaLoaded && activeImportableCount === 0 && (
                              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                                Select at least one lesson in the list below.
                              </p>
                            )}
                          </div>

                          <div className="mt-3 flex w-full flex-wrap gap-1 rounded-lg border border-slate-200 p-0.5 sm:w-auto dark:border-slate-700">
                            {[
                              { id: "all", label: "All", count: mediaCounts.all },
                              { id: "video", label: "Videos", count: mediaCounts.video },
                              { id: "pdf", label: "PDFs", count: mediaCounts.pdf },
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:flex-none sm:px-3 ${
                                  mediaFilter === tab.id
                                    ? "bg-teal-600 text-white"
                                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                                }`}
                                onClick={() => setMediaFilter(tab.id)}
                              >
                                {tab.label} ({tab.count})
                              </button>
                            ))}
                          </div>

                          {previewFile && previewStreamUrl && (
                            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                                <p className="truncate text-sm font-medium">{mediaDisplayName(previewFile)}</p>
                                <button type="button" className="btn-ghost p-1" onClick={() => setPreviewFile(null)} aria-label="Close preview">
                                  <FiX size={16} />
                                </button>
                              </div>
                              <div className="bg-black/5 p-2 dark:bg-black/30">
                                {previewFile.mediaType === "video" ? (
                                  <video
                                    key={previewStreamUrl}
                                    src={previewStreamUrl}
                                    controls
                                    playsInline
                                    className="max-h-[40vh] w-full rounded-lg bg-black sm:max-h-[320px]"
                                  />
                                ) : (
                                  <iframe
                                    title={mediaDisplayName(previewFile)}
                                    src={previewStreamUrl}
                                    className="viewer-frame w-full rounded-lg bg-white"
                                  />
                                )}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 space-y-2">
                            {topicMediaLoading && !activeTopic?.mediaLoaded && (
                              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                                <FiLoader className="animate-spin" size={16} />
                                Loading lessons from Telegram…
                              </div>
                            )}
                            {activeTopic?.mediaLoaded && selectableMediaInView.length > 0 && (
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
                                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                  Pick lessons, rename titles, and set playback order
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="btn-ghost text-xs"
                                    disabled={busy}
                                    onClick={() => setAllLessonsSelected(activeTopic.id, true)}
                                  >
                                    Select all
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-ghost text-xs"
                                    disabled={busy}
                                    onClick={() => setAllLessonsSelected(activeTopic.id, false)}
                                  >
                                    Clear all
                                  </button>
                                </div>
                              </div>
                            )}
                            {filteredMedia.map((item, index) => {
                              const planEntry = activeLessonPlan?.entries[item.messageId];
                              const orderIndex = activeLessonPlan?.order?.indexOf(item.messageId) ?? -1;
                              const canReorder = !item.imported && orderIndex >= 0;
                              const displayTitle =
                                planEntry?.displayName ??
                                (item.imported ? mediaDisplayName(item) : suggestLessonTitle(item));

                              return (
                              <div
                                key={item.messageId}
                                className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start sm:gap-3 ${
                                  item.imported
                                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                                    : planEntry?.selected === false
                                      ? "border-slate-200 opacity-70 dark:border-slate-700"
                                      : "border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                  {!item.imported ? (
                                    <input
                                      type="checkbox"
                                      className="mt-1 shrink-0"
                                      checked={planEntry?.selected !== false}
                                      disabled={busy}
                                      onChange={(e) =>
                                        setLessonSelected(activeTopic.id, item.messageId, e.target.checked)
                                      }
                                    />
                                  ) : (
                                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center text-emerald-600">
                                      <FiCheck size={14} />
                                    </span>
                                  )}
                                  {!item.imported && canReorder && (
                                    <span className="mt-0.5 w-5 shrink-0 text-center text-xs font-semibold text-slate-400">
                                      {orderIndex + 1}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    className="mt-0.5 shrink-0 text-teal-600"
                                    disabled={busy}
                                    onClick={() => openPreview(item, activeTopic)}
                                    title="Preview"
                                  >
                                    {item.mediaType === "video" ? <FiPlay size={16} /> : <FiFileText size={16} />}
                                  </button>
                                  <div className="min-w-0 flex-1 space-y-1">
                                    {!item.imported ? (
                                      <input
                                        className="input w-full text-sm"
                                        value={displayTitle}
                                        disabled={busy}
                                        onChange={(e) =>
                                          setLessonDisplayName(
                                            activeTopic.id,
                                            item.messageId,
                                            e.target.value
                                          )
                                        }
                                        placeholder="Lesson title in your course"
                                      />
                                    ) : (
                                      <p className="truncate font-medium">{displayTitle}</p>
                                    )}
                                    <p className="text-xs text-slate-500">
                                      {formatTelegramMediaMeta(item)}
                                      {!item.imported && item.fileName && item.fileName !== displayTitle ? (
                                        <span className="text-slate-400"> · Telegram: {mediaDisplayName(item)}</span>
                                      ) : null}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1 self-start sm:self-center">
                                  {!item.imported && canReorder && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-ghost p-1"
                                        disabled={busy || orderIndex <= 0}
                                        onClick={() => moveLessonInPlan(activeTopic.id, item.messageId, -1)}
                                        aria-label="Move up"
                                      >
                                        <FiChevronUp size={16} />
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-ghost p-1"
                                        disabled={
                                          busy ||
                                          orderIndex < 0 ||
                                          orderIndex >= (activeLessonPlan?.order?.length || 0) - 1
                                        }
                                        onClick={() => moveLessonInPlan(activeTopic.id, item.messageId, 1)}
                                        aria-label="Move down"
                                      >
                                        <FiChevronDown size={16} />
                                      </button>
                                    </>
                                  )}
                                  {item.imported ? (
                                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                      <FiCheck size={12} /> In course
                                    </span>
                                  ) : (
                                    <span className="text-xs font-medium text-amber-600">New</span>
                                  )}
                                </div>
                              </div>
                            );
                            })}
                            {!filteredMedia.length && !topicMediaLoading && (
                              <p className="text-sm text-slate-400">No lessons in this subject yet.</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="py-12 text-center text-sm text-slate-400">Select a subject on the left</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!programmeId && session.connected && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Open a coaching batch on the Dashboard first, then use Import batch again.
          </p>
        )}
      </div>
    </Layout>
  );
};

export default TelegramImportPage;
