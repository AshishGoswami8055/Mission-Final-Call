const UnderlinedSentence = ({ text = "", underlined = "" }) => {
  const needle = String(underlined || "").trim();
  if (!needle) return <span>{text}</span>;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = String(text || "").split(new RegExp(`(${escaped})`, "i"));
  return (
    <span>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <u key={`${part}-${index}`} className="decoration-2 underline-offset-2 font-semibold">
            {part}
          </u>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </span>
  );
};

const normalizeType = (type = "") => {
  const aliases = {
    similar_sounding: "confusable_words",
    idiom_mcq: "idiom_meaning",
    antonym_context: "antonym_in_context",
    synonym_context: "synonym_in_context",
    match_list: "match_the_following",
  };
  return aliases[type] || type;
};

const CdsPyqBody = ({ question }) => {
  const type = normalizeType(question.questionType);

  if (type === "confusable_words") {
    return (
      <div className="mt-5 space-y-4">
        <p className="font-serif text-lg font-bold tracking-wide text-slate-950 dark:text-white">
          {(question.wordSet || question.focusWords || []).join(", ") || question.prompt}
        </p>
        <ol className="space-y-2.5 font-serif text-[15px] leading-7 text-slate-800 dark:text-slate-200">
          {(question.sentences || []).map((sentence) => (
            <li key={sentence.number} className="flex gap-2">
              <span className="w-5 shrink-0 font-semibold">{sentence.number}.</span>
              <UnderlinedSentence text={sentence.text} underlined={sentence.underlined} />
            </li>
          ))}
        </ol>
        <p className="font-serif text-sm leading-6 text-slate-700 dark:text-slate-300">
          {question.questionStem ||
            "In which of the sentences given above has / have the word(s) been used correctly?"}
        </p>
      </div>
    );
  }

  if (type === "match_the_following") {
    return (
      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">
              List I (Word / Expression)
            </p>
            <ul className="space-y-2 font-serif text-sm text-slate-800 dark:text-slate-200">
              {(question.listI || []).map((row) => (
                <li key={row.key}>
                  <span className="font-bold">{row.key}.</span> {row.text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">
              List II (Meaning)
            </p>
            <ul className="space-y-2 font-serif text-sm text-slate-800 dark:text-slate-200">
              {(question.listII || []).map((row) => (
                <li key={row.key}>
                  <span className="font-bold">{row.key}.</span> {row.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Code</p>
      </div>
    );
  }

  if (type === "sentence_relationship") {
    return (
      <div className="mt-5 space-y-4 font-serif text-[15px] leading-7 text-slate-800 dark:text-slate-200">
        <p>
          <span className="font-bold">S1:</span> {question.s1}
        </p>
        <p>
          <span className="font-bold">S2:</span> {question.s2}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {question.questionStem || "The second sentence:"}
        </p>
      </div>
    );
  }

  if (type === "antonym_in_context" || type === "synonym_in_context") {
    return (
      <p className="mt-5 font-serif text-lg leading-8 text-slate-900 dark:text-slate-100">
        <UnderlinedSentence
          text={question.sentence || question.prompt}
          underlined={question.targetWord || question.underlinedWord}
        />
      </p>
    );
  }

  if (type === "word_pair") {
    return (
      <h3 className="mt-5 font-serif text-2xl font-bold text-slate-950 dark:text-white">{question.prompt}</h3>
    );
  }

  if (type === "idiom_meaning") {
    return (
      <h3 className="mt-5 font-serif text-2xl font-bold text-slate-950 dark:text-white">
        {question.idiom || question.prompt}
      </h3>
    );
  }

  if (type === "word_meaning") {
    return (
      <div className="mt-5 space-y-2">
        <h3 className="font-serif text-2xl font-bold text-slate-950 dark:text-white">
          {question.word || question.prompt?.replace(/:$/, "")}
        </h3>
        <p className="font-serif text-sm text-slate-600 dark:text-slate-300">
          {question.questionStem || "Select the most appropriate meaning of the given word."}
        </p>
      </div>
    );
  }

  return null;
};

export default CdsPyqBody;
