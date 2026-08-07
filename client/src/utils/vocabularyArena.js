import {
  FiBookOpen,
  FiClock,
  FiEdit3,
  FiHelpCircle,
  FiRefreshCw,
  FiShield,
  FiTarget,
  FiZap,
} from "react-icons/fi";

export const VOCABULARY_MODES = [
  {
    id: "mixed",
    title: "CDS Mixed Drill",
    description: "Due words, synonyms, antonyms, idioms and one-word substitutions.",
    icon: FiZap,
    accent: "from-violet-500 to-indigo-600",
  },
  {
    id: "mcq",
    title: "MCQ Arena",
    description: "Four-option questions with plausible CDS-focused distractors.",
    icon: FiHelpCircle,
    accent: "from-blue-500 to-cyan-600",
  },
  {
    id: "reverse",
    title: "Reverse Recall",
    description: "See the meaning, retrieve the exact word, then self-rate.",
    icon: FiRefreshCw,
    accent: "from-emerald-500 to-teal-600",
  },
  {
    id: "fill_blank",
    title: "Context Drill",
    description: "Type the missing word in CDS-style sentences.",
    icon: FiBookOpen,
    accent: "from-amber-500 to-orange-600",
  },
  {
    id: "typing",
    title: "Typing Recall",
    description: "Type the answer from a definition or contextual clue.",
    icon: FiEdit3,
    accent: "from-fuchsia-500 to-pink-600",
  },
  {
    id: "weak",
    title: "Weak Words",
    description: "Prioritizes recent misses, low confidence and overdue words.",
    icon: FiTarget,
    accent: "from-rose-500 to-red-600",
  },
  {
    id: "timed",
    title: "Timed Drill",
    description: "10, 20, 30 or 50 mixed questions against a visible clock.",
    icon: FiClock,
    accent: "from-cyan-600 to-blue-700",
  },
  {
    id: "exam",
    title: "CDS Exam Mode",
    description: "Timed PYQ-style drill: idioms, usage, confusing words and substitutions.",
    icon: FiShield,
    accent: "from-slate-700 to-slate-950",
  },
];

export const QUESTION_COUNT_OPTIONS = [10, 20, 30, 50];

/** Shared per-question time budget for timed and exam drills. */
export const SECONDS_PER_QUESTION = 45;

export const sessionDurationSeconds = (mode, questionCount) => {
  const count = Math.max(1, Number(questionCount) || 10);
  if (mode === "timed" || mode === "exam") return count * SECONDS_PER_QUESTION;
  return 0;
};

export const isTimedMode = (mode) => mode === "timed" || mode === "exam";

export const formatPracticeMode = (mode = "") =>
  VOCABULARY_MODES.find((item) => item.id === mode)?.title ||
  String(mode || "Practice").replace(/_/g, " ");

export const formatResponseTime = (milliseconds = 0) => {
  const seconds = Math.max(0, Number(milliseconds) || 0) / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
};

export const accuracyTone = (accuracy = 0) => {
  if (accuracy >= 80) return "text-emerald-400";
  if (accuracy >= 60) return "text-amber-400";
  return "text-rose-400";
};
