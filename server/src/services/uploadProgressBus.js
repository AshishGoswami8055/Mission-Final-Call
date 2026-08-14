/**
 * In-memory upload-progress store, keyed by client-generated uploadId.
 *
 * Phases emitted by content controllers:
 *   pending       → received, validating
 *   server-recv   → multer receiving file from browser (rare to surface, browser already shows this)
 *   downloading   → yt-dlp pulling a YouTube video
 *   uploading     → server → Cloudinary chunked upload (per-byte updates)
 *   finalizing    → Cloudinary finished, persisting Mongo doc / cleanup
 *   done          → success
 *   error         → failed (carries `error` message)
 *
 * The frontend polls GET /api/contents/upload-progress/:uploadId.
 */

const stateMap = new Map();
const TTL_MS = 10 * 60 * 1000;
const ACTIVE_TTL_MS = 60 * 60 * 1000;

const now = () => Date.now();

export const initProgress = (uploadId, patch = {}) => {
  if (!uploadId) return;
  stateMap.set(uploadId, {
    phase: "pending",
    percent: 0,
    bytesLoaded: 0,
    bytesTotal: 0,
    fileIndex: 0,
    filesTotal: 1,
    currentFile: null,
    message: null,
    error: null,
    startedAt: now(),
    updatedAt: now(),
    ...patch,
  });
};

export const setProgress = (uploadId, patch = {}) => {
  if (!uploadId) return;
  const prev = stateMap.get(uploadId) || {};
  stateMap.set(uploadId, {
    ...prev,
    ...patch,
    updatedAt: now(),
  });
};

export const getProgress = (uploadId) => {
  if (!uploadId) return null;
  return stateMap.get(uploadId) || null;
};

export const clearProgress = (uploadId) => {
  if (!uploadId) return;
  stateMap.delete(uploadId);
};

export const failProgress = (uploadId, message) => {
  if (!uploadId) return;
  setProgress(uploadId, {
    phase: "error",
    error: String(message || "Upload failed"),
  });
};

export const completeProgress = (uploadId, patch = {}) => {
  if (!uploadId) return;
  setProgress(uploadId, {
    phase: "done",
    percent: 100,
    error: null,
    cancelled: false,
    ...patch,
  });
};

export const requestCancel = (uploadId) => {
  if (!uploadId) return;
  const prev = stateMap.get(uploadId) || {};
  stateMap.set(uploadId, {
    ...prev,
    cancelRequested: true,
    updatedAt: now(),
  });
};

export const isCancelled = (uploadId) => {
  if (!uploadId) return false;
  return Boolean(stateMap.get(uploadId)?.cancelRequested);
};

export const throwIfCancelled = (uploadId) => {
  if (!isCancelled(uploadId)) return;
  const message = "Import cancelled by user";
  failProgress(uploadId, message);
  const err = new Error(message);
  err.code = "CANCELLED";
  throw err;
};

const sweep = () => {
  const terminalCutoff = now() - TTL_MS;
  const activeCutoff = now() - ACTIVE_TTL_MS;
  for (const [id, state] of stateMap) {
    const isTerminal = state.phase === "done" || state.phase === "error";
    const cutoff = isTerminal ? terminalCutoff : activeCutoff;
    if ((state.updatedAt || 0) < cutoff) {
      stateMap.delete(id);
    }
  }
};

const interval = setInterval(sweep, 60_000);
if (typeof interval.unref === "function") interval.unref();
