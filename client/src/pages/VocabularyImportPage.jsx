import { useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiFileText, FiUploadCloud } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import ImportErrorList from "../components/vocabulary/ImportErrorList";
import ImportPreviewTable from "../components/vocabulary/ImportPreviewTable";
import VocabularyHeader from "../components/vocabulary/VocabularyHeader";
import useVocabularyImport from "../hooks/useVocabularyImport";

const SAMPLE = `Word: Anachronism
Meaning: Something placed in the wrong historical period
Example: The digital watch was an anachronism in the period drama.
Synonyms: chronological error, misplacement
Antonyms: contemporary detail
Root Word: chron
Root Meaning: time
Part of Speech: noun
Mnemonic: ANA put CHRON (time) in the wrong place
Exam Tag: CDS synonym
Difficulty: hard
Tags: pyq, confusing-words`;

const VocabularyImportPage = () => {
  const navigate = useNavigate();
  const arenaImport = useVocabularyImport();
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [type, setType] = useState("vocabulary");

  const preview = async () => {
    if (!file && !text.trim()) {
      toast.error("Choose a file or paste structured text.");
      return;
    }
    try {
      await arenaImport.previewImport({ file, text, type });
    } catch {
      // Hook renders the stable error.
    }
  };

  const commit = async () => {
    try {
      const result = await arenaImport.commitImport(type);
      toast.success(`${result.inserted} added, ${result.updated} updated`);
      navigate("/vocabulary");
    } catch {
      // Hook renders the stable error.
    }
  };

  return (
    <Layout title="Import Vocabulary">
      <div className="space-y-5">
        <VocabularyHeader
          backTo="/vocabulary"
          eyebrow="ARSENAL INTAKE"
          title="Import Vocabulary"
          subtitle="Preview every row before it reaches your Arena. Invalid rows are isolated; valid rows continue safely."
          actions={false}
        />
        {!arenaImport.preview ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-[#151515]">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-500"><FiUploadCloud /> File import</p>
              <h2 className="mt-2 font-display text-xl font-black text-slate-950 dark:text-white">CSV, Excel or OCR image</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">CSV/Excel may include word, meaning, example, synonyms, antonyms, tags, rootWord, partOfSpeech, mnemonic, examTag, difficulty and clozeSentence.</p>
              <select className="input mt-5" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="vocabulary">Vocabulary</option>
                <option value="idiom">Idioms</option>
                <option value="one_word">One-word substitution</option>
              </select>
              <label className="mt-3 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-5 text-center transition hover:border-indigo-500 hover:bg-indigo-500/5 dark:border-white/10">
                <FiFileText size={28} className="text-indigo-500" />
                <span className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">{file?.name || "Choose import file"}</span>
                <span className="mt-1 text-xs text-slate-400">.csv · .xls · .xlsx · .png · .jpg · .webp</span>
                <input type="file" className="hidden" accept=".csv,.xls,.xlsx,image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </label>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-[#151515]">
              <p className="text-xs font-black uppercase tracking-wider text-violet-500">STRUCTURED TEXT</p>
              <h2 className="mt-2 font-display text-xl font-black text-slate-950 dark:text-white">Paste CDS notes</h2>
              <textarea className="input mt-4 min-h-[300px] font-mono text-xs leading-6" placeholder={SAMPLE} value={text} onChange={(event) => setText(event.target.value)} />
            </article>
            <div className="lg:col-span-2">
              {arenaImport.error ? <p className="mb-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-500">{arenaImport.error}</p> : null}
              <button type="button" className="btn-primary w-full min-h-12" disabled={arenaImport.loading} onClick={preview}>
                {arenaImport.loading ? "Parsing and validating…" : "Preview import"}
              </button>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {Object.entries(arenaImport.preview.summary || {}).map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/[0.08] dark:bg-[#151515]">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="mt-1 font-display text-2xl font-black text-slate-950 dark:text-white">{value}</p>
                </div>
              ))}
            </div>
            <ImportErrorList rows={arenaImport.preview.rows} />
            <ImportPreviewTable rows={arenaImport.preview.rows} />
            {arenaImport.error ? <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-500">{arenaImport.error}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={arenaImport.reset}>Change source</button>
              <button type="button" className="btn-primary" disabled={!arenaImport.preview.summary?.valid || arenaImport.committing} onClick={commit}>
                <FiCheck /> {arenaImport.committing ? "Importing…" : `Import ${arenaImport.preview.summary?.valid || 0} valid rows`}
              </button>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
};

export default VocabularyImportPage;
