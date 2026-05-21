import api from "../api/client";

export const createUploadId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `up_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const pollUploadProgress = (uploadId, onUpdate, intervalMs = 450) => {
  if (!uploadId) return () => {};
  let active = true;

  const run = async () => {
    while (active) {
      try {
        const { data } = await api.get(`/contents/upload-progress/${uploadId}`);
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
