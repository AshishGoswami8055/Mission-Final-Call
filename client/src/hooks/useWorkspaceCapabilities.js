import { useCallback, useEffect, useState } from "react";
import api from "../api/client";

/** Workspace feature flags from GET /api/workspace/capabilities */
export const useWorkspaceCapabilities = () => {
  const [capabilities, setCapabilities] = useState({
    videoAiAsk: false,
    paperExtract: false,
    youtubeUpload: false,
    youtubeConfigured: false,
    loaded: false,
  });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/workspace/capabilities");
      setCapabilities({
        videoAiAsk: Boolean(data.videoAiAsk),
        paperExtract: Boolean(data.paperExtract),
        youtubeUpload: Boolean(data.youtubeUpload),
        youtubeConfigured: Boolean(data.youtubeConfigured),
        loaded: true,
      });
    } catch {
      setCapabilities((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...capabilities, refresh };
};

export default useWorkspaceCapabilities;
