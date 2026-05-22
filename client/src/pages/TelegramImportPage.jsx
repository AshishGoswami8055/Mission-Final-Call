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
import { buildTelegramPreviewStreamUrl, formatDuration, formatFileSize, formatTelegramMediaMeta } from "../utils/media";
import { createUploadId, pollUploadProgress } from "../utils/uploadProgress";

const mediaDisplayName = (item) => item?.displayName || item?.fileName || "Untitled";

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
  const [selectedTopicIds, setSelectedTopicIds] = useState(new Set());
  const [topicSearch, setTopicSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);

  const [autoSync, setAutoSync] = useState(true);
  const [cleanSync, setCleanSync] = useState(false);
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
      const trackedIds = (data.syncTopicIds || []).map(Number).filter(Boolean);
      if (trackedIds.length) {
        setSelectedTopicIds(new Set(trackedIds));
        setSelectedTopicId(trackedIds[0] ?? topics[0]?.id ?? null);
      } else {
        setSelectedTopicIds(new Set());
        setSelectedTopicId(topics[0]?.id ?? null);
      }
      if (typeof data.autoSyncEnabled === "boolean") {
        setAutoSync(data.autoSyncEnabled);
      }
      setSelectedFiles([]);
      setPreviewFile(null);
      setMediaFilter("all");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load topics");
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
  const selectedCount = selectedTopicIds.size;
  const selectedFileCount = selectedFiles.length;
  const allTopicIds = preview?.topics?.map((t) => t.id) || [];

  const fileKey = (topicId, messageId) => `${topicId}:${messageId}`;

  const isFileSelected = (topicId, messageId) =>
    selectedFiles.some((f) => f.topicId === topicId && f.messageId === messageId);

  const getFileSelectionIndex = (topicId, messageId) =>
    selectedFiles.findIndex((f) => f.topicId === topicId && f.messageId === messageId);

  const toggleFileSelection = (item, topic) => {
    if (item.imported || busy) return;
    const exists = isFileSelected(topic.id, item.messageId);
    if (exists) {
      setSelectedFiles((prev) =>
        prev.filter((f) => !(f.topicId === topic.id && f.messageId === item.messageId))
      );
      setPreviewFile((prev) =>
        prev?.topicId === topic.id && prev?.messageId === item.messageId ? null : prev
      );
      return;
    }
    setSelectedFiles((prev) => [
      ...prev,
      {
        topicId: topic.id,
        messageId: item.messageId,
        mediaType: item.mediaType,
        fileName: mediaDisplayName(item),
        displayName: mediaDisplayName(item),
        duration: item.duration ?? null,
        size: item.size,
        topicTitle: topic.title,
      },
    ]);
  };

  const removeSelectedFile = (topicId, messageId) => {
    setSelectedFiles((prev) =>
      prev.filter((f) => !(f.topicId === topicId && f.messageId === messageId))
    );
    setPreviewFile((prev) =>
      prev?.topicId === topicId && prev?.messageId === messageId ? null : prev
    );
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    setPreviewFile(null);
  };

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

  const selectAllVisibleFiles = () => {
    if (!activeTopic) return;
    const toAdd = filteredMedia
      .filter((item) => !item.imported && !isFileSelected(activeTopic.id, item.messageId))
      .map((item) => ({
        topicId: activeTopic.id,
        messageId: item.messageId,
        mediaType: item.mediaType,
        fileName: mediaDisplayName(item),
        displayName: mediaDisplayName(item),
        duration: item.duration ?? null,
        size: item.size,
        topicTitle: activeTopic.title,
      }));
    if (!toAdd.length) return;
    setSelectedFiles((prev) => [...prev, ...toAdd]);
  };

  const openPreview = (item, topic) => {
    setPreviewFile({
      topicId: topic.id,
      messageId: item.messageId,
      mediaType: item.mediaType,
      fileName: mediaDisplayName(item),
      displayName: mediaDisplayName(item),
      duration: item.duration ?? null,
      topicTitle: topic.title,
    });
  };

  const previewStreamUrl =
    previewFile && selectedChannel?.id
      ? buildTelegramPreviewStreamUrl(selectedChannel.id, previewFile.messageId)
      : "";

  const toggleTopicSelection = (topicId, checked) => {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(topicId);
      else next.delete(topicId);
      return next;
    });
  };

  const selectAllTopics = () => {
    setSelectedTopicIds(new Set(allTopicIds));
  };

  const clearTopicSelection = () => {
    setSelectedTopicIds(new Set());
  };

  const runWithProgressTick = (phase, startPercent, endPercent, intervalMs = 400) => {
    let current = startPercent;
    const timer = setInterval(() => {
      current = Math.min(endPercent - 2, current + 3);
      setProgress((prev) => (prev?.active ? { ...prev, percent: current } : prev));
    }, intervalMs);
    return () => clearInterval(timer);
  };

  const handleImportSelectedFiles = async () => {
    if (!selectedChannel?.id || !programmeId) {
      toast.error("Select a batch on the dashboard first");
      return;
    }
    if (!selectedFiles.length) {
      toast.error("Select at least one file to import");
      return;
    }

    const uploadId = createUploadId();
    setBusy(true);
    setProgress({
      active: true,
      phase: "importing",
      percent: 2,
      message: "Importing selected files…",
      current: 0,
      total: selectedFiles.length,
    });

    const stopPoll = pollUploadProgress(uploadId, (data) => {
      setProgress({
        active: true,
        phase: data.phase || "importing",
        percent: Math.min(99, Number(data.percent) || 2),
        message: data.message || "Importing selected files…",
        current: Math.min(data.fileIndex || 0, selectedFiles.length),
        total: selectedFiles.length,
        currentLabel: data.currentFile,
        currentFile: data.currentFile,
        detail:
          data.filesTotal > 0
            ? `File ${Math.min(data.fileIndex + 1, data.filesTotal)}/${data.filesTotal}`
            : undefined,
        bytesLoaded: data.bytesLoaded,
        bytesTotal: data.bytesTotal,
      });
    });

    try {
      const { data } = await api.post("/telegram/import-batch", {
        channelId: selectedChannel.id,
        channelTitle: selectedChannel.title,
        programmeId,
        useForumTopics: true,
        importAll: false,
        autoSync,
        uploadId,
        selectedItems: selectedFiles.map(({ topicId, messageId, topicTitle, displayName }) => ({
          topicId,
          messageId,
          topicTitle,
          displayName,
        })),
      });

      stopPoll();
      setProgress({
        active: true,
        phase: "done",
        percent: 100,
        message: `Imported ${data.imported || 0} file(s) in your selected order`,
        detail: data.skipped ? `${data.skipped} skipped` : undefined,
        current: selectedFiles.length,
        total: selectedFiles.length,
      });

      toast.success(
        `Imported ${data.imported || 0} file(s)` +
          (data.skipped ? ` (${data.skipped} skipped)` : "")
      );

      setSelectedFiles([]);
      setPreviewFile(null);
      await loadPreview();

      setTimeout(() => {
        navigate("/", { state: { refreshCourse: true } });
      }, 1200);
    } catch (error) {
      stopPoll();
      setProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Import failed",
      });
      toast.error(error.response?.data?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (importAll = true, topicIdsOverride = null) => {
    if (!selectedChannel?.id || !programmeId) {
      toast.error("Select a batch on the dashboard first");
      return;
    }

    const topicIds = topicIdsOverride?.length
      ? topicIdsOverride
      : importAll
        ? allTopicIds
        : [...selectedTopicIds];
    if (!topicIds.length) {
      toast.error("Select at least one subject to import");
      return;
    }

    const topicsToImport =
      preview?.topics?.filter((t) => topicIds.includes(t.id)) ||
      topicIds.map((id) => ({ id, title: `Subject ${id}`, newCount: 0 }));

    const cleanStep = importAll && cleanSync ? 1 : 0;
    const uploadId = createUploadId();

    setBusy(true);
    setProgress({
      active: true,
      phase: cleanStep ? "cleaning" : "importing",
      percent: 2,
      message: cleanStep ? "Removing old import…" : `Importing ${topicsToImport.length} subject(s)…`,
      current: 0,
      total: topicsToImport.length,
    });

    let stopTick = null;
    let stopPoll = null;
    try {
      if (cleanStep) {
        stopTick = runWithProgressTick("cleaning", 5, 15);
        await api.post("/telegram/cleanup-import", {
          channelId: selectedChannel.id,
          programmeId,
        });
        stopTick();
        stopTick = null;
      }

      stopPoll = pollUploadProgress(uploadId, (data) => {
        setProgress({
          active: true,
          phase: data.phase || "importing",
          percent: Math.min(99, Number(data.percent) || 5),
          message: data.message || "Importing selected subjects…",
          currentLabel: data.currentFile,
          currentFile: data.currentFile,
          detail:
            data.filesTotal > 0
              ? `PDF ${Math.min(data.fileIndex + 1, data.filesTotal)}/${data.filesTotal}`
              : `${topicsToImport.length} subject(s)`,
          bytesLoaded: data.bytesLoaded,
          bytesTotal: data.bytesTotal,
        });
      });

      const { data } = await api.post("/telegram/import-batch", {
        channelId: selectedChannel.id,
        channelTitle: selectedChannel.title,
        programmeId,
        importAll,
        useForumTopics: true,
        topicIds: importAll ? undefined : topicIds,
        autoSync,
        cleanSync: importAll && cleanSync,
        uploadId,
        pruneUnselectedTopics: !importAll,
      });

      stopPoll();
      stopPoll = null;

      const prunedSubjects = data.pruned?.deletedSubjects || 0;
      setProgress({
        active: true,
        phase: "done",
        percent: 100,
        message: `Imported ${data.imported || 0} file(s) into ${topicsToImport.length} subject(s)`,
        detail: [
          data.skipped ? `${data.skipped} skipped` : null,
          prunedSubjects ? `${prunedSubjects} unselected subject(s) removed` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
        current: topicsToImport.length,
        total: topicsToImport.length,
      });

      toast.success(
        `Imported ${data.imported || 0} files into ${topicsToImport.length} subject(s)` +
          (data.skipped ? ` (${data.skipped} skipped)` : "") +
          (prunedSubjects ? ` · removed ${prunedSubjects} unselected subject(s)` : "")
      );

      setSelectedTopicIds(new Set(topicIds.map(Number)));
      await loadPreview();

      setTimeout(() => {
        navigate("/", { state: { refreshCourse: true } });
      }, 1200);
    } catch (error) {
      if (stopTick) stopTick();
      if (stopPoll) stopPoll();
      setProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Import failed",
      });
      toast.error(error.response?.data?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    if (!selectedChannel?.id || !programmeId) return;
    if (!selectedTopicIds.size) {
      toast.error("Select at least one subject to sync");
      return;
    }
    setBusy(true);
    setProgress({
      active: true,
      phase: "syncing",
      percent: 10,
      message: "Syncing new uploads for selected subjects…",
    });
    const stopTick = runWithProgressTick("syncing", 10, 95);
    try {
      const { data } = await api.post(`/telegram/sync/${encodeURIComponent(selectedChannel.id)}`, {
        programmeId,
        topicIds: [...selectedTopicIds],
      });
      stopTick();
      setProgress({
        active: true,
        phase: "done",
        percent: 100,
        message: data.message || `Sync complete${data.imported ? ` · ${data.imported} new file(s)` : ""}`,
      });
      toast.success(data.imported ? `Synced ${data.imported} new file(s)` : "Sync complete");
      await loadPreview();
      setTimeout(() => setProgress(null), 1000);
    } catch (error) {
      stopTick();
      setProgress({
        active: true,
        phase: "error",
        percent: 0,
        message: error.response?.data?.message || "Sync failed",
      });
      toast.error(error.response?.data?.message || "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const handleClearCourse = async () => {
    if (!programmeId) return;
    if (
      !window.confirm(
        "Remove all imported subjects and lessons from this batch? The batch itself will stay."
      )
    ) {
      return;
    }

    const subjectCount = preview?.topics?.length || 0;
    setBusy(true);
    setProgress({
      active: true,
      phase: "deleting",
      percent: 8,
      message: "Clearing course content…",
      detail: subjectCount ? `${subjectCount} subjects` : undefined,
    });
    const stopTick = runWithProgressTick("deleting", 8, 92);

    try {
      const { data } = await api.post(`/programmes/${programmeId}/clear-course`);
      stopTick();
      setProgress({
        active: true,
        phase: "done",
        percent: 100,
        message: `Cleared ${data.deletedSubjects || 0} subject(s)`,
        detail: `${data.deletedContents || 0} lesson(s) removed`,
      });
      toast.success(`Cleared ${data.deletedSubjects || 0} subjects`);
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

  return (
    <Layout
      title="Import course from Telegram"
      subtitle={`${programmeName} · Forum topics → Subjects · Videos & PDFs`}
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
            <p className="mt-1 text-sm text-slate-500">Log in once to import from your private channels.</p>
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
                  <button type="button" className="btn-ghost text-xs" onClick={() => api.post("/telegram/logout").then(() => { setSession({ connected: false }); toast.success("Logged out"); })}>
                    <FiLogOut size={12} /> Logout
                  </button>
                </div>
                <h2 className="font-semibold">Select Telegram channel / group</h2>
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
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => { setSelectedChannel(null); setPreview(null); }}>
                    <FiArrowLeft size={14} /> Channels
                  </button>
                  <span className="font-semibold">{selectedChannel.title}</span>
                  {preview && (
                    <span className="text-xs text-slate-500">
                      {preview.topics?.length || 0} subjects · {preview.totalMedia} files · {preview.totalNew} new
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={handleSync}>
                      <FiRefreshCw size={14} className={busy && progress?.phase === "syncing" ? "animate-spin" : ""} /> Sync
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      disabled={busy || !programmeId || selectedFileCount === 0}
                      onClick={handleImportSelectedFiles}
                    >
                      <FiUploadCloud size={14} />
                      {busy && progress?.phase === "importing" && selectedFileCount > 0
                        ? "Importing…"
                        : `Import selected files (${selectedFileCount})`}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      disabled={busy || !programmeId || selectedCount === 0}
                      onClick={() => handleImport(false)}
                    >
                      <FiUploadCloud size={14} />
                      {busy && progress?.phase === "importing" && selectedFileCount === 0
                        ? "Importing…"
                        : `Import selected subjects (${selectedCount})`}
                    </button>
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={busy || !programmeId}
                      onClick={() => handleImport(true)}
                    >
                      <FiUploadCloud size={14} />
                      {busy && progress?.phase === "importing" ? "Importing…" : "Import all subjects"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 px-4 py-2 text-sm dark:border-slate-800">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} disabled={busy} />
                    Auto-sync new uploads (selected subjects only)
                  </label>
                  <span className="text-xs text-slate-500">
                    Only checked subjects are imported, synced, and kept in your course
                  </span>
                  <label className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                    <input
                      type="checkbox"
                      checked={cleanSync}
                      onChange={(e) => setCleanSync(e.target.checked)}
                      disabled={busy}
                    />
                    Clean old import first (full batch only)
                  </label>
                  {programmeId && (
                    <button
                      type="button"
                      className="ml-auto text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
                      disabled={busy}
                      onClick={handleClearCourse}
                    >
                      Clear entire course
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
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">
                            {selectedCount} selected for import/sync
                          </span>
                          <div className="flex gap-2">
                            <button type="button" className="font-medium text-teal-700 hover:underline dark:text-teal-400" onClick={selectAllTopics}>
                              All
                            </button>
                            <button type="button" className="font-medium text-slate-500 hover:underline" onClick={clearTopicSelection}>
                              None
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="max-h-[60vh] overflow-y-auto">
                        {filteredTopics.map((topic) => {
                          const isActive = selectedTopicId === topic.id;
                          const isChecked = selectedTopicIds.has(topic.id);
                          return (
                            <div
                              key={topic.id}
                              className={`flex items-start gap-2 border-b border-slate-100 px-3 py-3 transition dark:border-slate-800/80 ${
                                isActive ? "bg-teal-50 dark:bg-teal-950/30" : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1 shrink-0"
                                checked={isChecked}
                                disabled={busy}
                                onChange={(e) => toggleTopicSelection(topic.id, e.target.checked)}
                              />
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => setSelectedTopicId(topic.id)}
                              >
                                <span className="block font-medium text-slate-800 dark:text-slate-100">{topic.title}</span>
                                <span className="text-xs text-slate-500">
                                  {topic.mediaCount} files · {topic.newCount} new
                                  {topic.importedCount > 0 ? ` · ${topic.importedCount} added` : ""}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                        {!filteredTopics.length && (
                          <p className="p-6 text-center text-sm text-slate-400">No forum topics found in this channel.</p>
                        )}
                      </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto p-4">
                      {activeTopic ? (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-lg font-semibold">{activeTopic.title}</h3>
                              <p className="text-xs text-slate-500">
                                {activeTopic.mediaCount} videos & PDFs in this subject
                              </p>
                            </div>
                            <button
                              type="button"
                              className="btn-secondary text-xs"
                              disabled={busy || !programmeId || !selectedTopicIds.has(activeTopic.id)}
                              onClick={() => handleImport(false, [activeTopic.id])}
                            >
                              Import this subject
                            </button>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
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
                            <button
                              type="button"
                              className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                              disabled={busy}
                              onClick={selectAllVisibleFiles}
                            >
                              Select visible
                            </button>
                            {selectedFileCount > 0 && (
                              <button
                                type="button"
                                className="text-xs font-medium text-slate-500 hover:underline"
                                disabled={busy}
                                onClick={clearSelectedFiles}
                              >
                                Clear file selection
                              </button>
                            )}
                          </div>

                          {selectedFileCount > 0 && (
                            <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900/40 dark:bg-teal-950/20">
                              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">
                                Import order ({selectedFileCount})
                              </p>
                              <ol className="mt-2 space-y-1">
                                {selectedFiles.map((file, index) => (
                                  <li
                                    key={fileKey(file.topicId, file.messageId)}
                                    className="flex items-center gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-sm dark:bg-black/20"
                                  >
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                                      {index + 1}
                                    </span>
                                    <span className="shrink-0 text-teal-600">
                                      {file.mediaType === "video" ? <FiPlay size={12} /> : <FiFileText size={12} />}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">{mediaDisplayName(file)}</span>
                                    <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 sm:inline">
                                      {[file.mediaType === "video" && formatDuration(file.duration), formatFileSize(file.size)]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                    <span className="hidden text-xs text-slate-500 sm:inline">{file.topicTitle}</span>
                                    <button
                                      type="button"
                                      className="btn-ghost p-1 text-slate-400 hover:text-rose-600"
                                      disabled={busy}
                                      onClick={() => removeSelectedFile(file.topicId, file.messageId)}
                                      aria-label="Remove from selection"
                                    >
                                      <FiX size={14} />
                                    </button>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {previewFile && previewStreamUrl && (
                            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{mediaDisplayName(previewFile)}</p>
                                  <p className="text-xs text-slate-500">{previewFile.topicTitle}</p>
                                </div>
                                <button
                                  type="button"
                                  className="btn-ghost p-1"
                                  onClick={() => setPreviewFile(null)}
                                  aria-label="Close preview"
                                >
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
                            {filteredMedia.map((item) => {
                              const selectedIndex = getFileSelectionIndex(activeTopic.id, item.messageId);
                              const isSelected = selectedIndex >= 0;
                              const isPreviewing =
                                previewFile?.topicId === activeTopic.id &&
                                previewFile?.messageId === item.messageId;

                              return (
                                <div
                                  key={item.messageId}
                                  className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                                    item.imported
                                      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                                      : isSelected
                                        ? "border-teal-300 bg-teal-50/50 dark:border-teal-800 dark:bg-teal-950/20"
                                        : isPreviewing
                                          ? "border-sky-300 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/20"
                                          : "border-slate-200 dark:border-slate-700"
                                  }`}
                                >
                                  {!item.imported ? (
                                    <input
                                      type="checkbox"
                                      className="mt-1 shrink-0"
                                      checked={isSelected}
                                      disabled={busy}
                                      onChange={() => toggleFileSelection(item, activeTopic)}
                                    />
                                  ) : (
                                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center text-emerald-600">
                                      <FiCheck size={14} />
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    className="mt-0.5 shrink-0 text-teal-600 hover:text-teal-800 dark:hover:text-teal-400"
                                    disabled={busy}
                                    onClick={() => openPreview(item, activeTopic)}
                                    title="Preview before import"
                                  >
                                    {item.mediaType === "video" ? <FiPlay size={16} /> : <FiFileText size={16} />}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">{mediaDisplayName(item)}</p>
                                    <p className="text-xs text-slate-500">{formatTelegramMediaMeta(item)}</p>
                                  </div>
                                  {isSelected && (
                                    <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                      #{selectedIndex + 1}
                                    </span>
                                  )}
                                  {item.imported ? (
                                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                      <FiCheck size={12} /> Added
                                    </span>
                                  ) : (
                                    <span className="text-xs font-medium text-sky-600">New</span>
                                  )}
                                </div>
                              );
                            })}
                            {!filteredMedia.length && (
                              <p className="text-sm text-slate-400">
                                No {mediaFilter === "all" ? "videos or PDFs" : `${mediaFilter}s`} in this topic.
                              </p>
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
            Select a coaching batch on the Dashboard first, then open Import again.
          </p>
        )}
      </div>
    </Layout>
  );
};

export default TelegramImportPage;
