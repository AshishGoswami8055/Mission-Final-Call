import { FiAlertTriangle } from "react-icons/fi";

const ImportErrorList = ({ rows = [] }) => {
  const errors = rows.filter((row) => row.errors?.length);
  if (!errors.length) return null;
  return (
    <section className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-4">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-300">
        <FiAlertTriangle /> {errors.length} row-level issue{errors.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm text-rose-800 dark:text-rose-100">
        {errors.map((row) => (
          <li key={row.rowNumber}><strong>Row {row.rowNumber}:</strong> {row.errors.join(" ")}</li>
        ))}
      </ul>
    </section>
  );
};

export default ImportErrorList;
