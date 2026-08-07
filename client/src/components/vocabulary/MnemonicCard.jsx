import { FiCpu } from "react-icons/fi";

const MnemonicCard = ({ mnemonic }) => {
  if (!mnemonic) return null;
  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
        <FiCpu /> Memory lock
      </p>
      <p className="mt-2 text-sm leading-6 text-amber-950 dark:text-amber-100">{mnemonic}</p>
    </div>
  );
};

export default MnemonicCard;
