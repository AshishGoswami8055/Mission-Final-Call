const KEYWORD_THEMES = [
  { match: /biology|bio|zoology|botany/i, gradient: "from-emerald-500 to-green-700", icon: "🧬" },
  { match: /english.*vocab|vocabulary/i, gradient: "from-violet-600 to-purple-800", icon: "💬" },
  { match: /english.*grammar|grammar/i, gradient: "from-sky-500 to-blue-700", icon: "📚" },
  { match: /english.*breakfast|breakfast/i, gradient: "from-orange-500 to-amber-700", icon: "☕" },
  { match: /english.*practice|english/i, gradient: "from-slate-600 to-slate-800", icon: "✍️" },
  { match: /one\s*pager|one-pager/i, gradient: "from-rose-600 to-pink-800", icon: "📄" },
  { match: /g-?form|explanation/i, gradient: "from-indigo-600 to-blue-900", icon: "📊" },
  { match: /polity|constitution|law/i, gradient: "from-amber-400 to-yellow-600", icon: "⚖️" },
  { match: /history|mediaeval|modern|ancient/i, gradient: "from-amber-600 to-orange-800", icon: "🏛️" },
  { match: /geography|geo|map/i, gradient: "from-teal-500 to-cyan-700", icon: "🌍" },
  { match: /economics|economy|eco/i, gradient: "from-lime-600 to-green-700", icon: "📈" },
  { match: /math|maths|quant/i, gradient: "from-blue-600 to-indigo-800", icon: "🔢" },
  { match: /physics|chem|chemistry|science/i, gradient: "from-cyan-500 to-blue-700", icon: "⚗️" },
  { match: /current|affairs|ca/i, gradient: "from-red-500 to-rose-700", icon: "📰" },
];

const FALLBACK_GRADIENTS = [
  "from-teal-500 to-teal-700",
  "from-violet-500 to-violet-800",
  "from-sky-500 to-blue-700",
  "from-orange-500 to-amber-700",
  "from-rose-500 to-pink-700",
  "from-indigo-500 to-indigo-800",
  "from-emerald-500 to-green-700",
  "from-amber-400 to-yellow-600",
  "from-slate-600 to-slate-800",
];

export const getSubjectTheme = (name = "", index = 0) => {
  const label = String(name || "").trim();
  for (const theme of KEYWORD_THEMES) {
    if (theme.match.test(label)) {
      return { gradient: theme.gradient, icon: theme.icon };
    }
  }
  return {
    gradient: FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length],
    icon: "📘",
  };
};
