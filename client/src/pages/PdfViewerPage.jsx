import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowLeft } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import Loader from "../components/Loader";
import { resolveContentSrc } from "../utils/media";

const PdfViewerPage = () => {
  const { id } = useParams();
  const [item, setItem] = useState(null);

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const { data } = await api.get(`/contents/${id}`);
        setItem(data);
      } catch (error) {
        toast.error(error.response?.data?.message || "Could not load document");
      }
    };
    fetchItem();
  }, [id]);

  if (!item) return <Loader fullPage label="Opening document…" />;

  const src = resolveContentSrc(item);

  return (
    <div className="min-h-screen bg-slate-100 p-4 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-4">
        <Link to="/" className="btn-secondary inline-flex">
          <FiArrowLeft /> Back
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          <p className="text-sm text-slate-500">
            {item.subjectId?.name} / {item.chapterId?.chapterName}
          </p>
          <iframe title={item.title} src={src} className="mt-4 h-[75vh] w-full rounded-lg border border-slate-300" />
        </div>
      </div>
    </div>
  );
};

export default PdfViewerPage;
