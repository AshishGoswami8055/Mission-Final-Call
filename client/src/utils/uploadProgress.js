import api from "../api/client";

export const createUploadId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `up_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const fetchUploadProgress = (uploadId) =>
  api.get(`/contents/upload-progress/${encodeURIComponent(uploadId)}`, {
    params: { _t: Date.now() },
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });

export const pollUploadProgress = (uploadId, onUpdate, intervalMs = 450) => {
  if (!uploadId) return () => {};
  let active = true;

  const run = async () => {
    while (active) {
      try {
        const { data } = await fetchUploadProgress(uploadId);
        if (!active) break;
        if (data?.phase && data.phase !== "idle") {
          onUpdate(data);
          if (data.phase === "done" || data.phase === "error") break;
        }
      } catch {
        // keep polling through transient errors
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };

  run();
  return () => {
    active = false;
  };
};

/** Poll until phase is done or error; resolves with final progress payload. */
export const waitForUploadProgress = (uploadId, onUpdate, intervalMs = 450, options = {}) => {
  if (!uploadId) {
    return Promise.reject(new Error("Missing uploadId"));
  }

  const maxWaitMs = Number(options.maxWaitMs) || 45 * 60 * 1000;
  let active = true;
  let settled = false;
  let settle = null;
  const startedAt = Date.now();
  let lastProgressAt = startedAt;

  const promise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });

  const finish = (fn, value) => {
    if (settled) return;
    settled = true;
    active = false;
    fn(value);
  };

  const run = async () => {
    while (active) {
      if (Date.now() - startedAt > maxWaitMs) {
        finish(
          settle.reject,
          new Error("Import is taking too long. Try Cancel, refresh the page, and import again.")
        );
        break;
      }
      try {
        const { data } = await fetchUploadProgress(uploadId);
        if (!active) break;
        if (data?.phase && data.phase !== "idle") {
          lastProgressAt = Date.now();
          onUpdate?.(data);
          if (data.phase === "done") {
            finish(settle.resolve, data);
            break;
          }
          if (data.phase === "error") {
            finish(settle.reject, new Error(data.error || "Import failed"));
            break;
          }
        } else if (Date.now() - lastProgressAt > 3 * 60 * 1000) {
          onUpdate?.({
            phase: "pending",
            percent: 5,
            message: "Still working… connecting to Telegram (this can take a few minutes).",
          });
          lastProgressAt = Date.now();
        }
      } catch {
        // keep polling through transient errors
      }
      if (!active) break;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };

  run();

  promise.cancel = () => {
    active = false;
  };

  return promise;
};

export const cancelTelegramProgress = async (uploadId) => {
  if (!uploadId) return;
  try {
    await api.post(`/telegram/progress/${encodeURIComponent(uploadId)}/cancel`);
  } catch {
    // ignore — server may already be done
  }
};

/** Map polled upload-progress payload to OperationProgressOverlay shape. */
export const mapTelegramPollToOverlay = (data, base = {}) => {
  const phase =
    data?.phase === "done"
      ? "done"
      : data?.phase === "error"
        ? data?.error?.toLowerCase().includes("cancel")
          ? "cancelled"
          : "error"
        : "syncing";
  return {
    active: true,
    phase,
    percent: Math.min(99, Number(data?.percent) || base.percent || 5),
    message: data?.message || base.message || "Updating from Telegram…",
    currentFile: data?.currentFile,
    currentLabel: data?.currentFile,
    total: data?.filesTotal || 0,
    current: data?.fileIndex || 0,
    errorDetail: data?.error || null,
    ...base,
  };
};

export const formatBytes = (n) => {
  if (n == null || Number.isNaN(n)) return "";
  const v = Number(n);
  if (v <= 0) return "0 B";
  if (v < 1024) return `${Math.round(v)} B`;
  const kb = v / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};
