import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import api from "../api/client";
import { isTelegramStreamContent } from "../utils/media";

const INITIAL_STATUS = {
  checking: true,
  connected: false,
  live: false,
  error: "",
  phone: "",
};

const RECHECK_THROTTLE_MS = 60000;

/**
 * Poll Telegram session health for stream playback (live connection banner + retry).
 */
export const useTelegramPlaybackStatus = ({ item, itemRef, isTelegramStream }) => {
  const [telegramStatus, setTelegramStatus] = useState(INITIAL_STATUS);
  const [telegramStatusResetting, setTelegramStatusResetting] = useState(false);
  const lastCheckAtRef = useRef(0);

  const applySessionPayload = useCallback((data) => {
    setTelegramStatus({
      checking: false,
      connected: Boolean(data?.connected),
      live: Boolean(data?.live),
      error: data?.error || "",
      phone: data?.phone || "",
    });
  }, []);

  const refreshTelegramStatus = useCallback(async (options = {}) => {
    const { force = false, silent = false } = options;
    if (!isTelegramStreamContent(itemRef.current)) return;

    const now = Date.now();
    if (!force && now - lastCheckAtRef.current < RECHECK_THROTTLE_MS) {
      if (silent) return;
    }

    if (!silent) {
      setTelegramStatus((prev) => ({
        ...prev,
        checking: !prev.connected && !prev.live,
      }));
    }

    try {
      const { data } = await api.get("/telegram/session", {
        params: force ? { force: "1" } : undefined,
      });
      lastCheckAtRef.current = Date.now();
      applySessionPayload(data);
    } catch (error) {
      setTelegramStatus({
        checking: false,
        connected: false,
        live: false,
        error: error.response?.data?.message || "Could not check Telegram connection",
        phone: "",
      });
    }
  }, [applySessionPayload, itemRef]);

  useEffect(() => {
    if (!item || !isTelegramStream) return undefined;
    void refreshTelegramStatus({ force: true });
    const onFocus = () => {
      void refreshTelegramStatus({ silent: true });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshTelegramStatus({ silent: true });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [item?._id, isTelegramStream, refreshTelegramStatus]);

  const handleResetTelegramSession = useCallback(async () => {
    setTelegramStatusResetting(true);
    try {
      await api.post("/telegram/reset-session");
      toast.success("Telegram session reset. Wait 15–30 seconds, then recheck.");
      window.setTimeout(() => {
        void refreshTelegramStatus({ force: true });
      }, 4000);
    } catch (error) {
      toast.error(error.response?.data?.message || "Reset failed");
    } finally {
      setTelegramStatusResetting(false);
    }
  }, [refreshTelegramStatus]);

  const verifyTelegramForRetry = useCallback(async () => {
    try {
      const { data } = await api.get("/telegram/session", { params: { force: "1" } });
      applySessionPayload(data);
      if (!data.connected) {
        toast.error(data.error || "Telegram is not connected. Open Telegram settings and log in.");
        return false;
      }
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not verify Telegram connection");
      return false;
    }
  }, [applySessionPayload]);

  return {
    telegramStatus,
    telegramStatusResetting,
    refreshTelegramStatus,
    handleResetTelegramSession,
    verifyTelegramForRetry,
  };
};
