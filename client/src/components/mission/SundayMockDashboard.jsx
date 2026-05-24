import { useState } from "react";
import toast from "react-hot-toast";
import { FiFlag, FiSend } from "react-icons/fi";
import api from "../../api/client";

const shell =
  "rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-[#1a1a1a]";

const SundayMockDashboard = ({ mockItem, onSubmitted }) => {
  const [form, setForm] = useState({
    score: "",
    totalQuestions: "",
    attemptedQuestions: "",
    correctAnswers: "",
    timeTakenMinutes: "",
    weakSubjects: "",
  });
  const [submitting, setSubmitting] = useState(false);

  if (!mockItem) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const weakSubjects = form.weakSubjects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.post("/mission/mock/submit", {
        paperId: mockItem.paperId,
        title: mockItem.title,
        score: Number(form.score) || 0,
        totalQuestions: Number(form.totalQuestions) || 0,
        attemptedQuestions: Number(form.attemptedQuestions) || 0,
        correctAnswers: Number(form.correctAnswers) || 0,
        timeTakenMinutes: Number(form.timeTakenMinutes) || 0,
        weakSubjects,
      });
      toast.success("Mock test logged.");
      onSubmitted?.();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save mock result");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={`${shell} border-l-4 border-l-rose-500`}>
      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
        <FiFlag size={18} />
        <span className="text-xs font-bold uppercase tracking-wide">Sunday mock test</span>
      </div>
      <h3 className="font-display mt-2 text-lg font-semibold text-slate-900 dark:text-white">
        {mockItem.title}
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Complete the assigned PYQ, then log your score below.
      </p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
        {[
          ["score", "Score"],
          ["totalQuestions", "Total questions"],
          ["attemptedQuestions", "Attempted"],
          ["correctAnswers", "Correct"],
          ["timeTakenMinutes", "Time (minutes)"],
        ].map(([key, label]) => (
          <label key={key} className="block text-xs font-medium text-slate-500">
            {label}
            <input
              className="input mt-1 w-full"
              type="number"
              min={0}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </label>
        ))}
        <label className="block text-xs font-medium text-slate-500 sm:col-span-2">
          Weak subjects (comma-separated)
          <input
            className="input mt-1 w-full"
            value={form.weakSubjects}
            onChange={(e) => setForm((f) => ({ ...f, weakSubjects: e.target.value }))}
            placeholder="e.g. Polity, Geometry"
          />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary inline-flex gap-2" disabled={submitting}>
            <FiSend size={16} />
            {submitting ? "Saving…" : "Submit mock result"}
          </button>
        </div>
      </form>
    </section>
  );
};

export default SundayMockDashboard;
