import {
  FiBookOpen,
  FiClock,
  FiEdit3,
  FiFileText,
  FiGitMerge,
  FiHelpCircle,
  FiLayers,
  FiRefreshCw,
  FiShield,
  FiTarget,
  FiType,
  FiZap,
} from "react-icons/fi";

/** CDS exam-oriented practice modes (primary) */
export const CDS_EXAM_MODES = [
  {
    id: "cds_pyq",
    title: "CDS PYQ — AI",
    description: "Full CDS-style vocabulary MCQs generated from your word bank.",
    icon: FiFileText,
    accent: "from-amber-700 to-stone-900",
    section: "cds",
  },
  {
    id: "cds_confusable",
    title: "Confusable Words",
    description: "crops / corps / corpse — evaluate usage in three sentences.",
    icon: FiType,
    accent: "from-orange-600 to-red-800",
    section: "cds",
  },
  {
    id: "cds_idioms",
    title: "Idioms & Phrases",
    description: "Meaning-based MCQs like Mealy-mouthed, Play possum.",
    icon: FiBookOpen,
    accent: "from-violet-600 to-purple-900",
    section: "cds",
  },
  {
    id: "cds_antonyms",
    title: "Antonyms in Context",
    description: "Opposite meaning of the underlined word in a sentence.",
    icon: FiTarget,
    accent: "from-rose-600 to-red-900",
    section: "cds",
  },
  {
    id: "cds_word_meaning",
    title: "Word Meaning",
    description: "Select the most appropriate meaning — Iconoclast, Ubiquitous style.",
    icon: FiHelpCircle,
    accent: "from-blue-600 to-indigo-900",
    section: "cds",
  },
  {
    id: "cds_sentence_relationship",
    title: "Sentence Relationship",
    description: "Contradicts / Contrasts / Confirms / Qualifies between S1 and S2.",
    icon: FiGitMerge,
    accent: "from-teal-600 to-cyan-900",
    section: "cds",
  },
  {
    id: "cds_mixed_paper",
    title: "CDS Mixed Paper",
    description: "Mixed confusables, idioms, antonyms, definitions and S1/S2 logic.",
    icon: FiLayers,
    accent: "from-amber-600 to-orange-900",
    section: "cds",
  },
  {
    id: "cds_full_english",
    title: "Full CDS English Mode",
    description: "All CDS English formats including match-list and word pairs.",
    icon: FiShield,
    accent: "from-slate-700 to-slate-950",
    section: "cds",
  },
];

/** Legacy Arena drills (secondary — SRS / recall training) */
export const ARENA_LEGACY_MODES = [
  {
    id: "mixed",
    title: "SRS Mixed Drill",
    description: "Due words with synonyms, antonyms, idioms — spaced repetition focus.",
    icon: FiZap,
    accent: "from-violet-500 to-indigo-600",
    section: "legacy",
  },
  {
    id: "mcq",
    title: "MCQ Arena",
    description: "Four-option recall from your vocabulary bank.",
    icon: FiHelpCircle,
    accent: "from-blue-500 to-cyan-600",
    section: "legacy",
  },
  {
    id: "reverse",
    title: "Reverse Recall",
    description: "See the meaning, retrieve the exact word, then self-rate.",
    icon: FiRefreshCw,
    accent: "from-emerald-500 to-teal-600",
    section: "legacy",
  },
  {
    id: "fill_blank",
    title: "Context Drill",
    description: "Type the missing word in a sentence.",
    icon: FiBookOpen,
    accent: "from-amber-500 to-orange-600",
    section: "legacy",
  },
  {
    id: "typing",
    title: "Typing Recall",
    description: "Type the answer from a definition or clue.",
    icon: FiEdit3,
    accent: "from-fuchsia-500 to-pink-600",
    section: "legacy",
  },
  {
    id: "weak",
    title: "Weak Words",
    description: "Prioritizes recent misses and low confidence words.",
    icon: FiTarget,
    accent: "from-rose-500 to-red-600",
    section: "legacy",
  },
  {
    id: "timed",
    title: "Timed SRS Drill",
    description: "Mixed SRS questions against a visible clock.",
    icon: FiClock,
    accent: "from-cyan-600 to-blue-700",
    section: "legacy",
  },
  {
    id: "exam",
    title: "SRS Exam Mode",
    description: "Timed mixed drill from tagged exam vocabulary.",
    icon: FiShield,
    accent: "from-slate-600 to-slate-900",
    section: "legacy",
  },
];

export const VOCABULARY_MODES = [...CDS_EXAM_MODES, ...ARENA_LEGACY_MODES];

export const CDS_EXAM_MODE_IDS = CDS_EXAM_MODES.map((mode) => mode.id);

export const isCdsExamMode = (mode = "") => CDS_EXAM_MODE_IDS.includes(mode);

export const QUESTION_COUNT_OPTIONS = [10, 20, 30, 50];

export const SECONDS_PER_QUESTION = 45;

export const sessionDurationSeconds = (mode, questionCount) => {
  const count = Math.max(1, Number(questionCount) || 10);
  if (isCdsExamMode(mode) || mode === "timed" || mode === "exam") {
    return count * SECONDS_PER_QUESTION;
  }
  return 0;
};

export const isTimedMode = (mode) =>
  isCdsExamMode(mode) || mode === "timed" || mode === "exam";

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
