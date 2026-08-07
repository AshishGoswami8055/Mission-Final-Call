import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import VocabularyHeader from "../components/vocabulary/VocabularyHeader";
import WeakWordList from "../components/vocabulary/WeakWordList";

const VocabularyWeakWordsPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/vocabulary/weak-words", { params: { limit: 100 } });
      setItems(response.data.items || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load weak words.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const startRecovery = async () => {
    try {
      const response = await api.post("/vocabulary/session/start", {
        mode: "weak",
        questionCount: Math.min(30, Math.max(5, items.length)),
      });
      navigate(`/vocabulary/session/${response.data.session.sessionId}`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not start recovery drill.");
    }
  };

  return (
    <Layout title="Weak Words">
      <div className="space-y-5">
        <VocabularyHeader
          backTo="/vocabulary"
          eyebrow="RECOVERY QUEUE"
          title="Weak Words"
          subtitle="Words with repeated misses, low confidence, or overdue reviews — sorted by recovery priority."
          actions={false}
        />
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader label="Ranking weak words…" />
          </div>
        ) : (
          <WeakWordList items={items} onPractice={items.length ? startRecovery : null} />
        )}
      </div>
    </Layout>
  );
};

export default VocabularyWeakWordsPage;
