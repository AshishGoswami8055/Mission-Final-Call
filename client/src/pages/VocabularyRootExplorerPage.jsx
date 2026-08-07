import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiSearch } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import RootWordFamilyCard from "../components/vocabulary/RootWordFamilyCard";
import VocabularyHeader from "../components/vocabulary/VocabularyHeader";

const VocabularyRootExplorerPage = () => {
  const navigate = useNavigate();
  const [families, setFamilies] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/vocabulary/root-families", { params: { search, limit: 100 } });
      setFamilies(response.data.families || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load root families.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const practice = async (family) => {
    try {
      const response = await api.post("/vocabulary/session/start", {
        mode: "roots",
        rootWord: family.rootWord,
        questionCount: Math.min(20, Math.max(5, family.words.length)),
      });
      navigate(`/vocabulary/session/${response.data.session.sessionId}`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not start root drill.");
    }
  };

  return (
    <Layout title="Root Word Explorer">
      <div className="space-y-5">
        <VocabularyHeader
          backTo="/vocabulary"
          eyebrow="WORD FORMATION LAB"
          title="Root Word Explorer"
          subtitle="Decode unfamiliar CDS vocabulary by mastering the roots, prefixes and suffixes that construct it."
          actions={false}
        />
        <label className="relative block">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input h-12 pl-11" placeholder="Search chron, bene, anti, suffix or theme…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {loading ? (
          <div className="flex justify-center py-16"><Loader label="Mapping word families…" /></div>
        ) : families.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {families.map((family) => <RootWordFamilyCard key={family.rootWord} family={family} onPractice={practice} />)}
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-white/10">
            <p className="font-semibold text-slate-700 dark:text-slate-200">No root families found.</p>
            <p className="mt-1 text-sm text-slate-500">Add a rootWord during import or while editing entries.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default VocabularyRootExplorerPage;
