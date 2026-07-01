import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../api/client";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getApiErrorMessage = (error, fallbackMessage) => {
  const apiMessage = error?.response?.data?.message;
  const timeoutMsg = error?.code === "ECONNABORTED" ? "Request timed out after 120s. Try again." : null;
  return apiMessage || timeoutMsg || fallbackMessage;
};

const isGeminiProcessingError = (error) => {
  const status = error?.response?.status;
  const msg = String(error?.response?.data?.message || "");
  return status === 409 || /still processing/i.test(msg);
};

/**
 * Video AI overview + Ask panel state (OpenAI-backed when workspace capability enabled).
 */
export const useVideoContentAi = ({ contentId, canUseAiAsk }) => {
  const [aiOverview, setAiOverview] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [refreshingAi, setRefreshingAi] = useState(false);
  const [askInput, setAskInput] = useState("");
  const [askingAi, setAskingAi] = useState(false);
  const [askMessages, setAskMessages] = useState([]);
  const [askPanelOpen, setAskPanelOpen] = useState(true);
  const [askStatusText, setAskStatusText] = useState("");
  const [askErrorText, setAskErrorText] = useState("");
  const [processingStartedAt, setProcessingStartedAt] = useState(null);
  const [processingElapsedSec, setProcessingElapsedSec] = useState(0);

  useEffect(() => {
    const fetchAiOverview = async () => {
      if (!contentId || !canUseAiAsk) {
        setAiOverview(null);
        return;
      }
      setLoadingAi(true);
      try {
        const { data } = await api.get(`/contents/${contentId}/ai-overview`);
        setAiOverview(data);
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not load AI summary");
      } finally {
        setLoadingAi(false);
      }
    };
    fetchAiOverview();
  }, [contentId, canUseAiAsk]);

  useEffect(() => {
    if (!processingStartedAt) {
      setProcessingElapsedSec(0);
      return undefined;
    }
    const tick = () => {
      setProcessingElapsedSec(Math.floor((Date.now() - processingStartedAt) / 1000));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [processingStartedAt]);

  const refreshAiSummary = async () => {
    if (!contentId || !canUseAiAsk) return;
    setAskErrorText("");
    setProcessingStartedAt(Date.now());
    setRefreshingAi(true);
    try {
      const maxRetries = 8;
      const retryDelayMs = 7000;
      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const { data } = await api.post(`/contents/${contentId}/ai-refresh`, {}, { timeout: 120000 });
          setAiOverview(data);
          setAskStatusText("");
          setProcessingStartedAt(null);
          toast.success("AI summary generated");
          return;
        } catch (error) {
          lastError = error;
          if (isGeminiProcessingError(error) && attempt < maxRetries) {
            const left = maxRetries - attempt;
            setAskStatusText(`Video still processing... retrying in ${retryDelayMs / 1000}s (${left} retries left)`);
            await wait(retryDelayMs);
            continue;
          }
          throw error;
        }
      }

      throw lastError || new Error("Could not generate AI summary");
    } catch (error) {
      const message = getApiErrorMessage(error, "Could not generate AI summary");
      setAskErrorText(message);
      toast.error(message);
    } finally {
      setProcessingStartedAt(null);
      if (!askingAi) setAskStatusText("");
      setRefreshingAi(false);
    }
  };

  const submitAsk = async (promptText) => {
    const question = String(promptText || askInput).trim();
    if (!question || !contentId || !canUseAiAsk || askingAi) return;
    setAskErrorText("");
    setAskStatusText("Thinking...");
    const historyForApi = askMessages.map((m) => ({ role: m.role, text: m.text }));
    const nextMessages = [...askMessages, { role: "user", text: question }];
    setAskMessages(nextMessages);
    setAskInput("");
    setAskingAi(true);
    setProcessingStartedAt(Date.now());
    const startedAt = Date.now();
    const statusTimer = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      if (elapsedSec < 8) {
        setAskStatusText("Thinking...");
      } else if (elapsedSec < 25) {
        setAskStatusText("Preparing video context...");
      } else {
        setAskStatusText("Still processing. First run on uploaded videos can take longer.");
      }
    }, 1000);
    try {
      const maxRetries = 10;
      const retryDelayMs = 7000;
      let data = null;
      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const response = await api.post(
            `/contents/${contentId}/ai-ask`,
            { question, history: historyForApi },
            { timeout: 120000 }
          );
          data = response.data;
          break;
        } catch (error) {
          lastError = error;
          if (isGeminiProcessingError(error) && attempt < maxRetries) {
            const left = maxRetries - attempt;
            setAskStatusText(`Video still processing... retrying in ${retryDelayMs / 1000}s (${left} retries left)`);
            await wait(retryDelayMs);
            continue;
          }
          throw error;
        }
      }

      if (!data) throw lastError || new Error("Ask failed");
      setAskMessages((prev) => [...prev, { role: "assistant", text: data.answer || "No answer returned." }]);
    } catch (error) {
      const message = getApiErrorMessage(error, "Ask failed");
      setAskErrorText(message);
      toast.error(message);
      setAskMessages((prev) => prev.filter((m, idx) => !(m.role === "user" && idx === prev.length - 1)));
    } finally {
      clearInterval(statusTimer);
      setAskStatusText("");
      setProcessingStartedAt(null);
      setAskingAi(false);
    }
  };

  return {
    aiOverview,
    loadingAi,
    refreshingAi,
    askInput,
    setAskInput,
    askingAi,
    askMessages,
    askPanelOpen,
    setAskPanelOpen,
    askStatusText,
    askErrorText,
    processingStartedAt,
    processingElapsedSec,
    refreshAiSummary,
    submitAsk,
  };
};
