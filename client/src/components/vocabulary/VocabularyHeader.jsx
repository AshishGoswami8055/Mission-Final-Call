import { FiActivity, FiArrowLeft, FiBarChart2, FiUpload } from "react-icons/fi";
import { Link } from "react-router-dom";

const VocabularyHeader = ({
  eyebrow = "CDS ENGLISH COMMAND CENTRE",
  title = "Vocabulary Arena",
  subtitle = "Build exam-speed recall through active practice.",
  backTo = "",
  actions = true,
}) => (
  <header className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#0b1120] px-5 py-6 text-white shadow-2xl shadow-slate-950/15 sm:px-7 sm:py-8">
    <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,.28),transparent_62%)]" />
    <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div>
        {backTo ? (
          <Link
            to={backTo}
            className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:text-white"
          >
            <FiArrowLeft /> Back to Arena
          </Link>
        ) : null}
        <p className="text-[11px] font-bold tracking-[0.24em] text-indigo-300">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{subtitle}</p>
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-2">
          <Link to="/vocabulary/practice" className="btn-primary bg-white text-slate-950 hover:bg-slate-100">
            <FiActivity /> Start drill
          </Link>
          <Link to="/vocabulary/import" className="rounded-xl border border-slate-700 px-3.5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-white/5">
            <FiUpload /> Import
          </Link>
          <Link to="/vocabulary/analytics" className="rounded-xl border border-slate-700 px-3.5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-white/5">
            <FiBarChart2 /> Analytics
          </Link>
        </div>
      ) : null}
    </div>
  </header>
);

export default VocabularyHeader;
