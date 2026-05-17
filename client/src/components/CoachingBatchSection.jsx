import { FiCloud, FiPlus, FiTrash2 } from "react-icons/fi";

/**
 * One-line coaching batch picker. Renders the active batch as a horizontal pill
 * row alongside a couple of secondary actions. No more boxed header / footer
 * blocks — keeps the dashboard tight.
 */
const CoachingBatchSection = ({
  programmes = [],
  selectedProgrammeId,
  onSelectProgramme,
  onAddBatch,
  onDeleteProgramme,
  onOpenCloudMappings,
}) => {
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Batch
        </span>
        {!programmes.length ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            No coaching batch yet. Add one →
          </span>
        ) : (
          programmes.map((p) => {
            const isActive = String(selectedProgrammeId) === String(p._id);
            const isMain = p.folderSlug === "Main";
            return (
              <div key={p._id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelectProgramme(p._id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                </button>
                {onDeleteProgramme && !isMain && (
                  <button
                    type="button"
                    aria-label={`Delete ${p.name}`}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-rose-500 shadow-sm transition-all group-hover:flex hover:bg-rose-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-rose-900/30"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProgramme(p);
                    }}
                  >
                    <FiTrash2 size={9} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {onOpenCloudMappings && (
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={onOpenCloudMappings}
            title="Pick which Cloudinary account each subject uses"
          >
            <FiCloud size={14} />
            <span className="hidden sm:inline">Cloud routing</span>
          </button>
        )}
        <button type="button" className="btn-secondary text-xs" onClick={onAddBatch}>
          <FiPlus size={14} />
          <span className="hidden sm:inline">Add batch</span>
        </button>
      </div>
    </section>
  );
};

export default CoachingBatchSection;
