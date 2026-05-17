import { format, formatDistanceToNow } from "date-fns";
import { FiClock, FiPlayCircle } from "react-icons/fi";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { useStudy } from "../context/StudyContext";

const HistoryPage = () => {
  const { watchHistory } = useStudy();

  return (
    <Layout
      title="Watch history"
      subtitle="Videos you watched recently"
      showSearch={false}
    >
      <div className="space-y-5">
        {!watchHistory.length ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 text-center dark:border-slate-700 dark:bg-slate-800/30">
            <div>
              <FiClock className="mx-auto mb-3 h-12 w-12 text-slate-400" />
              <p className="font-semibold text-slate-700 dark:text-slate-200">No history yet</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Start watching videos from the dashboard and they’ll appear here.</p>
              <Link to="/" className="btn-primary mt-4 inline-flex">
                Go to Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {watchHistory.map((entry) => (
              <li key={`${entry.contentId}-${entry.watchedAt}`}>
                <Link
                  to={`/video/${entry.contentId}`}
                  className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-200/30 transition-all hover:border-blue-200 hover:shadow-lg dark:border-slate-700/80 dark:bg-slate-800/50 dark:shadow-slate-950/20 dark:hover:border-blue-800/60 dark:hover:bg-blue-950/20"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-indigo-500 text-white shadow-md">
                    <FiPlayCircle size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{entry.title}</p>
                    <p className="text-xs text-slate-500">
                      {[entry.subjectName, entry.chapterName].filter(Boolean).join(" / ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                    {entry.durationMinutes > 0 && (
                      <span>Watched {entry.durationMinutes} min</span>
                    )}
                    <span title={entry.watchedAt ? format(new Date(entry.watchedAt), "PPp") : ""}>
                      {entry.watchedAt ? formatDistanceToNow(new Date(entry.watchedAt), { addSuffix: true }) : ""}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
};

export default HistoryPage;
