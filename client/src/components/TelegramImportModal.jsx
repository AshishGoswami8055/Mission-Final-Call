import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiLoader,
  FiLogOut,
  FiPlay,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiUploadCloud,
} from "react-icons/fi";
import api from "../api/client";
import { formatTelegramMediaMeta } from "../utils/media";

const STEPS = { AUTH: "auth", CHANNELS: "channels", BROWSE: "browse", BATCH: "batch" };

const formatDate = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
};

const TelegramImportModal = ({
  programmeId,
  programmeName,
  subjects,
  chapters,
  onClose,
  onImported,
}) => {
  const [step, setStep] = useState(STEPS.AUTH);
  const [session, setSession] = useState({ connected: false, phone: null });
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [channels, setChannels] = useState([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(null);

  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minSizeMb, setMinSizeMb] = useState("");
  const [maxSizeMb, setMaxSizeMb] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [batchPreview, setBatchPreview] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [createMissingSubjects, setCreateMissingSubjects] = useState(true);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const { data } = await api.get("/telegram/session");
      setSession(data);
      if (data.connected) setStep(STEPS.CHANNELS);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not check Telegram session");
    }
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

  const loadMessages = useCallback(async () => {
    if (!selectedChannel?.id) return;
    setMessagesLoading(true);
    try {
      const params = {
        page,
        limit: 25,
        search: search.trim() || undefined,
        mediaType: mediaType || undefined,
        importStatus: importStatus || undefined,
        sort,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        minSize: minSizeMb ? Number(minSizeMb) * 1024 * 1024 : undefined,
        maxSize: maxSizeMb ? Number(maxSizeMb) * 1024 * 1024 : undefined,
      };
      const { data } = await api.get(`/telegram/messages/${encodeURIComponent(selectedChannel.id)}`, {
        params,
      });
      setMessages(data.items || []);
      setStats(data.stats || null);
      setHasMore(Boolean(data.hasMore));
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load messages");
    } finally {
      setMessagesLoading(false);
    }
  }, [
    selectedChannel?.id,
    page,
    search,
    mediaType,
    importStatus,
    sort,
    dateFrom,
    dateTo,
    minSizeMb,
    maxSizeMb,
  ]);

  const loadBatchPreview = useCallback(async () => {
    if (!selectedChannel?.id || !programmeId) return;
    setBatchLoading(true);
    try {
      const { data } = await api.get("/telegram/preview-batch", {
        params: { channelId: selectedChannel.id, programmeId },
      });
      setBatchPreview(data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not preview batch");
    } finally {
      setBatchLoading(false);
    }
  }, [selectedChannel?.id, programmeId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (step === STEPS.CHANNELS) loadChannels();
  }, [step, loadChannels]);

  useEffect(() => {
    if (step === STEPS.BROWSE) loadMessages();
  }, [step, loadMessages]);

  useEffect(() => {
    if (step === STEPS.BATCH) loadBatchPreview();
  }, [step, loadBatchPreview]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await api.post("/telegram/login", { phone: phone.trim() });
      toast.success("OTP sent to your Telegram app");
      setNeedsPassword(false);
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
        toast.success("Enter your 2FA password");
        return;
      }
      setSession({ connected: true, phone: data.phone || phone.trim() });
      setStep(STEPS.CHANNELS);
      toast.success("Telegram connected");
    } catch (error) {
      toast.error(error.response?.data?.message || "OTP verification failed");
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
      setStep(STEPS.CHANNELS);
      toast.success("Telegram connected");
    } catch (error) {
      toast.error(error.response?.data?.message || "2FA verification failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/telegram/logout");
      setSession({ connected: false, phone: null });
      setStep(STEPS.AUTH);
      setSelectedChannel(null);
      setMessages([]);
      setSelectedIds(new Set());
      toast.success("Telegram disconnected");
    } catch (error) {
      toast.error(error.response?.data?.message || "Logout failed");
    }
  };

  const toggleMessage = (messageId, imported) => {
    if (imported) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const selectAllNew = () => {
    const ids = messages.filter((m) => !m.imported).map((m) => m.messageId);
    setSelectedIds(new Set(ids));
  };

  const handleImportSelected = async () => {
    if (!selectedChannel?.id || !programmeId || !selectedIds.size) return;
    setImporting(true);
    try {
      const { data } = await api.post("/telegram/import-batch", {
        channelId: selectedChannel.id,
        channelTitle: selectedChannel.title,
        programmeId,
        messageIds: Array.from(selectedIds),
        autoSync,
        createMissingSubjects,
        autoCreateChapters: true,
      });
      toast.success(`Imported ${data.imported}, skipped ${data.skipped}`);
      onImported?.();
      setSelectedIds(new Set());
      loadMessages();
    } catch (error) {
      toast.error(error.response?.data?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleImportWholeBatch = async () => {
    if (!selectedChannel?.id || !programmeId) return;
    setImporting(true);
    try {
      const { data } = await api.post("/telegram/import-batch", {
        channelId: selectedChannel.id,
        channelTitle: selectedChannel.title,
        programmeId,
        importAll: true,
        autoSync,
        createMissingSubjects,
        autoCreateChapters: true,
      });
      toast.success(
        `Batch import done: ${data.imported} new, ${data.skipped} skipped, ${data.createdSubjects || 0} subjects created`
      );
      onImported?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Batch import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleSyncNow = async () => {
    if (!selectedChannel?.id || !programmeId) return;
    setSyncing(true);
    try {
      const { data } = await api.post(`/telegram/sync/${encodeURIComponent(selectedChannel.id)}`, {
        programmeId,
      });
      toast.success(`Sync complete: ${data.imported || 0} new items`);
      onImported?.();
      loadBatchPreview();
      loadMessages();
    } catch (error) {
      toast.error(error.response?.data?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const channelMapping = selectedChannel?.mapping;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card max-w-4xl" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Import course from Telegram</h2>
            <p className="mt-1 text-sm text-slate-500">
              {programmeName ? `Batch: ${programmeName}` : "Select a batch on dashboard first"}
            </p>
          </div>
          {session.connected && (
            <button type="button" className="btn-ghost text-sm" onClick={handleLogout}>
              <FiLogOut size={14} /> Logout
            </button>
          )}
        </div>

        {step === STEPS.AUTH && (
          <div className="space-y-4">
            {!needsPassword ? (
              <form className="space-y-3" onSubmit={phone && otp ? handleVerifyOtp : handleLogin}>
                <label className="block text-sm font-medium">
                  Phone number
                  <input className="input mt-1" type="tel" placeholder="+91XXXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </label>
                {phone && (
                  <label className="block text-sm font-medium">
                    OTP code
                    <input className="input mt-1" type="text" value={otp} onChange={(e) => setOtp(e.target.value)} />
                  </label>
                )}
                <button type="submit" className="btn-primary w-full" disabled={authLoading}>
                  {authLoading ? <FiLoader className="animate-spin" /> : <FiSend size={14} />}
                  {otp ? "Verify OTP" : "Send OTP"}
                </button>
              </form>
            ) : (
              <form className="space-y-3" onSubmit={handleVerifyPassword}>
                <label className="block text-sm font-medium">
                  2FA password
                  <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </label>
                <button type="submit" className="btn-primary w-full" disabled={authLoading}>
                  Verify password
                </button>
              </form>
            )}
          </div>
        )}

        {step === STEPS.CHANNELS && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Connected as {session.phone}</p>
            {channelsLoading ? (
              <p className="py-8 text-center text-sm text-slate-400">Loading channels…</p>
            ) : (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-500 dark:border-slate-700"
                    onClick={() => {
                      setSelectedChannel(channel);
                      setSelectedIds(new Set());
                      setPage(1);
                      setStep(STEPS.BATCH);
                    }}
                  >
                    {channel.photo ? (
                      <img src={channel.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700">TG</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{channel.title}</p>
                      {channel.mapping?.autoSync && (
                        <p className="text-xs text-teal-600">Auto-sync enabled · {channel.mapping.totalImported || 0} imported</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === STEPS.BATCH && selectedChannel && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={() => setStep(STEPS.CHANNELS)}>
                <FiChevronLeft /> Channels
              </button>
              <span className="text-sm font-medium">{selectedChannel.title}</span>
              <button type="button" className="btn-ghost ml-auto text-sm" onClick={() => setStep(STEPS.BROWSE)}>
                Browse & filter
              </button>
            </div>

            {batchLoading ? (
              <p className="py-6 text-center text-sm text-slate-400">Analyzing channel…</p>
            ) : batchPreview ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Total media", batchPreview.total],
                  ["New", batchPreview.newCount],
                  ["Already added", batchPreview.importedCount],
                  ["Videos / PDFs", `${batchPreview.videoCount} / ${batchPreview.pdfCount}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="font-display mt-1 text-xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="text-sm font-medium">Whole batch import</p>
              <p className="mt-1 text-xs text-slate-500">
                Automatically maps files to subjects by filename, creates chapters, and skips already-imported media.
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={createMissingSubjects} onChange={(e) => setCreateMissingSubjects(e.target.checked)} />
                Create missing subjects from filenames
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
                Auto-sync new uploads to this batch
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={importing || !programmeId} onClick={handleImportWholeBatch}>
                  <FiUploadCloud size={14} /> Import entire channel
                </button>
                {channelMapping && (
                  <button type="button" className="btn-secondary" disabled={syncing} onClick={handleSyncNow}>
                    <FiRefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Sync now
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === STEPS.BROWSE && selectedChannel && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={() => setStep(STEPS.BATCH)}>
                <FiChevronLeft /> Batch import
              </button>
              <span className="text-sm font-medium">{selectedChannel.title}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative sm:col-span-2">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" placeholder="Search filename…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <select className="input" value={mediaType} onChange={(e) => { setMediaType(e.target.value); setPage(1); }}>
                <option value="">All types</option>
                <option value="video">Videos</option>
                <option value="pdf">PDFs</option>
              </select>
              <select className="input" value={importStatus} onChange={(e) => { setImportStatus(e.target.value); setPage(1); }}>
                <option value="">All status</option>
                <option value="new">New only</option>
                <option value="imported">Already added</option>
              </select>
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
                <option value="size">Largest first</option>
              </select>
              <input className="input" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
              <input className="input" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
              <input className="input" type="number" min="0" placeholder="Min MB" value={minSizeMb} onChange={(e) => { setMinSizeMb(e.target.value); setPage(1); }} />
              <input className="input" type="number" min="0" placeholder="Max MB" value={maxSizeMb} onChange={(e) => { setMaxSizeMb(e.target.value); setPage(1); }} />
            </div>

            {stats && (
              <p className="text-xs text-slate-500">
                {stats.totalMedia} files · {stats.newCount} new · {stats.importedCount} already added · {stats.videoCount} videos · {stats.pdfCount} PDFs
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={selectAllNew}>Select all new</button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setSelectedIds(new Set())}>Clear selection</button>
              <button type="button" className="btn-primary ml-auto text-sm" disabled={!selectedIds.size || importing} onClick={handleImportSelected}>
                Import selected ({selectedIds.size})
              </button>
            </div>

            {messagesLoading ? (
              <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
            ) : (
              <div className="max-h-[40vh] space-y-2 overflow-y-auto">
                {messages.map((msg) => {
                  const selected = selectedIds.has(msg.messageId);
                  return (
                    <button
                      key={msg.messageId}
                      type="button"
                      disabled={msg.imported}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
                        msg.imported
                          ? "cursor-default border-emerald-200 bg-emerald-50/50 opacity-80 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                          : selected
                            ? "border-teal-500 bg-teal-50 dark:border-teal-600 dark:bg-teal-950/30"
                            : "border-slate-200 dark:border-slate-700"
                      }`}
                      onClick={() => toggleMessage(msg.messageId, msg.imported)}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300"}`}>
                        {selected ? <FiCheck size={12} /> : null}
                      </span>
                      <span className="mt-0.5 text-teal-600">{msg.mediaType === "video" ? <FiPlay size={16} /> : <FiFileText size={16} />}</span>
                      <span className="min-w-0 flex-1">
                        <p className="truncate font-medium">{msg.displayName || msg.fileName}</p>
                        <p className="text-xs text-slate-500">
                          {formatTelegramMediaMeta(msg)} · {formatDate(msg.uploadDate)}
                        </p>
                        {msg.imported && (
                          <p className="mt-1 text-xs font-semibold text-emerald-600">
                            ✓ Already in course{msg.importedTitle ? `: ${msg.importedTitle}` : ""}
                          </p>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button type="button" className="btn-ghost text-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <FiChevronLeft /> Prev
              </button>
              <span className="text-xs text-slate-500">Page {page}</span>
              <button type="button" className="btn-ghost text-sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                Next <FiChevronRight />
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default TelegramImportModal;
