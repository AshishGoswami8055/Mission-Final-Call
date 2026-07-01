import { useCallback, useEffect, useState } from "react";
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

/**
 * Poll Telegram session health for stream playback (live connection banner + retry).
 */
export const useTelegramPlaybackStatus = ({ item, itemRef, isTelegramStream }) => {
  const [telegramStatus, setTelegramStatus] = useState(INITIAL_STATUS);
  const [telegramStatusResetting, setTelegramStatusResetting] = useState(false);

  const applySessionPayload = useCallback((data) => {
    setTelegramStatus({
      checking: false,
      connected: Boolean(data?.connected),
      live: Boolean(data?.live),
      error: data?.error || "",
      phone: data?.phone || "",
    });
  }, []);

  const refreshTelegramStatus = useCallback(async () => {
    if (!isTelegramStreamContent(itemRef.current)) return;
    setTelegramStatus((prev) => ({ ...prev, checking: true }));
    try {
      const { data } = await api.get("/telegram/session");
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
    void refreshTelegramStatus();
    const onFocus = () => {
      void refreshTelegramStatus();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshTelegramStatus();
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
        void refreshTelegramStatus();
      }, 4000);
    } catch (error) {
      toast.error(error.response?.data?.message || "Reset failed");
    } finally {
      setTelegramStatusResetting(false);
    }
  }, [refreshTelegramStatus]);

  const verifyTelegramForRetry = useCallback(async () => {
    try {
      const { data } = await api.get("/telegram/session");
      applySessionPayload(data);
      if (!data.live) {
        toast.error(data.error || "Telegram is not connected. Open Telegram settings and recheck.");
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
