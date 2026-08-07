import { useCallback, useEffect, useState } from "react";
import api from "../api/client";

const EMPTY_DASHBOARD = {
  counts: {
    total: 0,
    dueToday: 0,
    new: 0,
    learning: 0,
    mastered: 0,
    weak: 0,
    rootFamilies: 0,
  },
  consistency: { streak: 0, reviewedLast30Days: 0, accuracyLast30Days: 0 },
  recentSessions: [],
  recommendedMode: "mixed",
};

export const useVocabularyDashboard = () => {
  const [data, setData] = useState(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/vocabulary/dashboard");
      setData({ ...EMPTY_DASHBOARD, ...response.data });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load Vocabulary Arena.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.get("/vocabulary/dashboard")
      .then((response) => {
        if (active) setData({ ...EMPTY_DASHBOARD, ...response.data });
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Could not load Vocabulary Arena.");
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

export default useVocabularyDashboard;
