import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiArrowLeft,
  FiCheck,
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
import { createUploadId, pollUploadProgress } from "../utils/uploadProgress";

const mediaDisplayName = (item) => item?.displayName || item?.fileName || "Untitled";

const topicStatus = (topic) => {
  if (topic.importedCount > 0 && topic.newCount === 0) return "upToDate";
  if (topic.newCount > 0 && topic.importedCount > 0) return "hasUpdates";
  if (topic.newCount > 0) return "new";
  if (topic.importedCount > 0) return "upToDate";
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
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [selectedToAddIds, setSelectedToAddIds] = useState(new Set());
  const [topicSearch, setTopicSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [previewFile, setPreviewFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

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
    try {
      const { data } = await api.get("/telegram/forum-preview", {
        params: {
          channelId: selectedChannel.id,
          ...(programmeId ? { programmeId } : {}),
        },
      });
      setPreview(data);
      const topics = data.topics || [];
      const notInCourse = topics.filter((t) => t.importedCount === 0).map((t) => t.id);
      setSelectedToAddIds(new Set(notInCourse));
      setSelectedTopicId(topics[0]?.id ?? null);
      setPreviewFile(null);
      setMediaFilter("all");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load subjects");
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedChannel?.id, programmeId]);

  useEffect(() => {
    loadSession().catch(() => {});
  }, [loadSession]);

  useEffect(() => {
    if (session.connected) loadChannels();
  }, [session.connected, loadChannels]);

  useEffect(() => {
    if (selectedChannel) loadPreview();
  }, [selectedChannel, loadPreview]);

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
      inCourse: topics.filter((t) => t.importedCount > 0).length,
      totalNew: preview?.totalNew ?? 0,
      notInCourse: topics.filter((t) => t.importedCount === 0).length,
      withUpdates: topics.filter((t) => t.newCount > 0 && t.importedCount > 0).length,
    };
  }, [preview]);

  const filteredMedia = useMemo(() => {
    const media = activeTopic?.media || [];
    if (mediaFilter === "video") return media.filter((m) => m.mediaType === "video");
    if (mediaFilter === "pdf") return media.filter((m) => m.mediaType === "pdf");
    return media;
  }, [activeTopic?.media, mediaFilter]);

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
        const { data } = await api.post("/telegram/update-subject", {
          programmeId,
          subjectId: subject._id,
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
          return t && t.importedCount === 0;
        });

    if (!topicIds.length) {
      toast.error("Select at least one subject to add");
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

    let stopPoll = null;
    try {
      stopPoll = pollUploadProgress(uploadId, (data) => {
        setProgress({
          active: true,
          phase: data.phase || "importing",
          percent: Math.min(99, Number(data.percent) || 5),
          message: data.message || "Adding subjects…",
          currentFile: data.currentFile,
        });
      });

      const { data } = await api.post("/telegram/import-batch", {
        channelId: selectedChannel.id,
        channelTitle: selectedChannel.title,
        programmeId,
        importAll: false,
        useForumTopics: true,
        topicIds,
        autoSync: true,
        uploadId,
        pruneUnselectedTopics: false,
      });

      stopPoll();
      await finishAndRefresh(
        `Added ${data.imported || 0} lesson(s) from ${topicIds.length} subject(s)`
      );
    } catch (error) {
      if (stopPoll) stopPoll();
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
    return t && t.importedCount === 0;
  }).length;

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
            <p className="mt-1 text-sm text-slate-500">Log in once. After that, new lessons are handled for you.</p>
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
                  <p className="text-sm text-slate-500">Logged in as {session.phone}</p>
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
              <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#1a1a1a]">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="btn-ghost text-sm"
                      disabled={busy}
                      onClick={() => {
                        setSelectedChannel(null);
                        setPreview(null);
                      }}
                    >
                      <FiArrowLeft size={14} /> Channels
                    </button>
                    <span className="font-semibold">{selectedChannel.title}</span>
                    {preview && !previewLoading && (
                      <span className="text-xs text-slate-500">
                        {stats.inCourse} in course · {stats.totalNew} new lesson{stats.totalNew === 1 ? "" : "s"}
                      </span>
                    )}
                    <div className="ml-auto flex flex-wrap gap-2">
                      {stats.totalNew > 0 && (
                        <button
                          type="button"
                          className="btn-primary text-sm"
                          disabled={busy || !programmeId}
                          onClick={() => handleDownloadNew()}
                        >
                          <FiRefreshCw size={14} className={busy ? "animate-spin" : ""} />
                          Download new lessons ({stats.totalNew})
                        </button>
                      )}
                      {addableSelectedCount > 0 && (
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          disabled={busy || !programmeId}
                          onClick={() => handleAddSubjects()}
                        >
                          <FiUploadCloud size={14} />
                          Add to course ({addableSelectedCount})
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-400">
                    <strong className="font-semibold text-slate-800 dark:text-slate-200">How it works:</strong>{" "}
                    Check subjects you want in your course, click <em>Add to course</em>. After that, new Telegram
                    uploads are picked up automatically — use <em>Download new lessons</em> anytime, or update from
                    the dashboard.
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
                  <div className="grid flex-1 lg:grid-cols-[300px_1fr]">
                    <div className="border-r border-slate-200 dark:border-slate-800">
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
                          Green = already in your batch · check others to add
                        </p>
                      </div>
                      <div className="max-h-[60vh] overflow-y-auto">
                        {filteredTopics.map((topic) => {
                          const isActive = selectedTopicId === topic.id;
                          const canAdd = topic.importedCount === 0;
                          const inCourse = topic.importedCount > 0;
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
                                onClick={() => setSelectedTopicId(topic.id)}
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
                          <p className="p-6 text-center text-sm text-slate-400">No subjects found in this channel.</p>
                        )}
                      </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto p-4">
                      {activeTopic ? (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-lg font-semibold">{activeTopic.title}</h3>
                              <div className="mt-1">
                                <StatusBadge topic={activeTopic} />
                              </div>
                            </div>
                            {activeTopic.newCount > 0 && activeTopic.importedCount > 0 && (
                              <button
                                type="button"
                                className="btn-primary text-xs"
                                disabled={busy || !programmeId}
                                onClick={() => handleDownloadNew([activeTopic.id])}
                              >
                                <FiRefreshCw size={12} /> Download {activeTopic.newCount} new
                              </button>
                            )}
                            {activeTopic.importedCount === 0 && (
                              <button
                                type="button"
                                className="btn-secondary text-xs"
                                disabled={busy || !programmeId}
                                onClick={() => handleAddSubjects([activeTopic.id])}
                              >
                                <FiUploadCloud size={12} /> Add to course
                              </button>
                            )}
                          </div>

                          <div className="mt-3 inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                            {[
                              { id: "all", label: "All", count: mediaCounts.all },
                              { id: "video", label: "Videos", count: mediaCounts.video },
                              { id: "pdf", label: "PDFs", count: mediaCounts.pdf },
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
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
                                    className="max-h-[320px] w-full rounded-lg bg-black"
                                  />
                                ) : (
                                  <iframe
                                    title={mediaDisplayName(previewFile)}
                                    src={previewStreamUrl}
                                    className="h-[420px] w-full rounded-lg bg-white"
                                  />
                                )}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 space-y-2">
                            {filteredMedia.map((item) => (
                              <div
                                key={item.messageId}
                                className={`flex items-start gap-3 rounded-xl border p-3 ${
                                  item.imported
                                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                                    : "border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                <button
                                  type="button"
                                  className="mt-0.5 shrink-0 text-teal-600"
                                  disabled={busy}
                                  onClick={() => openPreview(item, activeTopic)}
                                  title="Preview"
                                >
                                  {item.mediaType === "video" ? <FiPlay size={16} /> : <FiFileText size={16} />}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium">{mediaDisplayName(item)}</p>
                                  <p className="text-xs text-slate-500">{formatTelegramMediaMeta(item)}</p>
                                </div>
                                {item.imported ? (
                                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                    <FiCheck size={12} /> In course
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-amber-600">New</span>
                                )}
                              </div>
                            ))}
                            {!filteredMedia.length && (
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
