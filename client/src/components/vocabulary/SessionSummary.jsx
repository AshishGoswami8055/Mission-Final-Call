import { FiBarChart2, FiCheckCircle, FiRefreshCw, FiTarget } from "react-icons/fi";
import { Link } from "react-router-dom";
import { accuracyTone, formatResponseTime } from "../../utils/vocabularyArena";

const SessionSummary = ({ session }) => (
  <section className="rounded-3xl border border-slate-800 bg-[#0b1120] p-6 text-white sm:p-8">
    <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">DRILL COMPLETE</p>
    <h1 className="mt-2 font-display text-4xl font-black">After-action report</h1>
    <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-2xl bg-white/[0.06] p-4">
        <p className="text-xs text-slate-400">Accuracy</p>
        <p className={`mt-2 font-display text-3xl font-black ${accuracyTone(session.accuracy)}`}>{session.accuracy || 0}%</p>
      </div>
      <div className="rounded-2xl bg-white/[0.06] p-4">
        <p className="text-xs text-slate-400">Correct</p>
        <p className="mt-2 font-display text-3xl font-black text-emerald-400">{session.correctAnswers || 0}</p>
      </div>
      <div className="rounded-2xl bg-white/[0.06] p-4">
        <p className="text-xs text-slate-400">Missed</p>
        <p className="mt-2 font-display text-3xl font-black text-rose-400">{session.wrongAnswers || 0}</p>
      </div>
      <div className="rounded-2xl bg-white/[0.06] p-4">
        <p className="text-xs text-slate-400">Avg. response</p>
        <p className="mt-2 font-display text-3xl font-black text-sky-400">{formatResponseTime(session.averageResponseTime)}</p>
      </div>
    </div>
    <p className="mt-5 flex items-center gap-2 text-sm text-slate-300">
      <FiCheckCircle className="text-emerald-400" /> {session.reviewUpdatesApplied || 0} SRS updates applied
    </p>
    {(session.weakCategories?.length || session.recommendedReview?.length) ? (
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-white/[0.06] p-4">
          <p className="text-xs font-black uppercase tracking-wider text-rose-300">Weak categories</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(session.weakCategories || []).map((row) => (
              <span key={row.category} className="rounded-lg bg-rose-400/10 px-2.5 py-1.5 text-xs font-bold text-rose-200">
                {String(row.category).replace(/_/g, " ")} · {row.misses}
              </span>
            ))}
            {!session.weakCategories?.length ? <span className="text-sm text-slate-400">No weak category detected.</span> : null}
          </div>
        </div>
        <div className="rounded-2xl bg-white/[0.06] p-4">
          <p className="text-xs font-black uppercase tracking-wider text-amber-300">Recommended next review</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(session.recommendedReview || []).slice(0, 8).map((item) => (
              <span key={item._id} title={item.meaning} className="rounded-lg bg-amber-400/10 px-2.5 py-1.5 text-xs font-bold text-amber-100">
                {item.word}
              </span>
            ))}
            {!session.recommendedReview?.length ? <span className="text-sm text-slate-400">No missed words — strong run.</span> : null}
          </div>
        </div>
      </div>
    ) : null}
    <div className="mt-7 flex flex-wrap gap-3">
      <Link to="/vocabulary/practice" className="btn-primary bg-white text-slate-950 hover:bg-slate-100"><FiRefreshCw /> Another drill</Link>
      <Link to="/vocabulary/weak" className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold hover:bg-white/5"><FiTarget /> Review weak words</Link>
      <Link to="/vocabulary/analytics" className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold hover:bg-white/5"><FiBarChart2 /> View analytics</Link>
    </div>
  </section>
);

export default SessionSummary;
