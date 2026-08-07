import { useCallback, useEffect, useState } from "react";
import api from "../api/client";

export const useVocabularyAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/vocabulary/analytics");
      setData(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load vocabulary analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.get("/vocabulary/analytics")
      .then((response) => {
        if (active) setData(response.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Could not load vocabulary analytics.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error, refresh };
};

export default useVocabularyAnalytics;
