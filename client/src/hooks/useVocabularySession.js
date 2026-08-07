import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";

export const useVocabularySession = (sessionId) => {
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const questionStartedAt = useRef(0);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/vocabulary/session/${sessionId}`);
      setSession(response.data.session);
      setQuestion(response.data.question);
      questionStartedAt.current = Date.now();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load practice session.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    api.get(`/vocabulary/session/${sessionId}`)
      .then((response) => {
        if (!active) return;
        setSession(response.data.session);
        setQuestion(response.data.question);
        questionStartedAt.current = Date.now();
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Could not load practice session.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const reveal = async () => {
    const response = await api.post(`/vocabulary/session/${sessionId}/reveal`);
    setFeedback({
      revealed: true,
      correctAnswer: response.data.answer?.correctAnswer,
      explanation: response.data.answer?.explanation,
    });
    return response.data;
  };

  const answer = async ({ answer: selectedAnswer, result, skipped = false }) => {
    setSubmitting(true);
    setError("");
    try {
      const response = await api.post(`/vocabulary/session/${sessionId}/answer`, {
        answer: selectedAnswer,
        result,
        skipped,
        responseTimeMs: Date.now() - questionStartedAt.current,
      });
      setFeedback(response.data);
      setSession(response.data.session);
      return response.data;
    } catch (requestError) {
      const message = requestError.response?.data?.message || "Could not submit answer.";
      setError(message);
      throw requestError;
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    const nextQuestion = feedback?.nextQuestion || null;
    setQuestion(nextQuestion);
    setFeedback(null);
    questionStartedAt.current = Date.now();
  };

  const finish = async () => {
    const response = await api.post(`/vocabulary/session/${sessionId}/finish`);
    setSession(response.data.session);
    return response.data.session;
  };

  return {
    session,
    question,
    feedback,
    loading,
    submitting,
    error,
    reveal,
    answer,
    next,
    finish,
    reload: load,
  };
};

export default useVocabularySession;
