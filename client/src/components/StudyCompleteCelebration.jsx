import { useEffect, useState } from "react";
import { FiCheckCircle } from "react-icons/fi";
import { useStudy } from "../context/StudyContext";

const CONFETTI_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#ec4899", "#8b5cf6"];

function ConfettiPiece({ color, delay, x, duration }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      className="confetti-piece absolute h-3 w-3 rounded-sm opacity-0"
      style={{
        left: `${x}%`,
        top: "-10px",
        backgroundColor: color,
        animation: mounted
          ? `confetti-fall ${duration}ms ease-out ${delay}ms forwards`
          : "none",
      }}
    />
  );
}

export default function StudyCompleteCelebration() {
  const { shouldShowCelebration, markCelebrationShown } = useStudy();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (shouldShowCelebration) setVisible(true);
  }, [shouldShowCelebration]);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => {
      markCelebrationShown();
      setVisible(false);
      setExiting(false);
    }, 400);
  };

  if (!visible) return null;

  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: i * 30 + Math.random() * 50,
    x: Math.random() * 100,
    duration: 2500 + Math.random() * 1000,
  }));

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
        exiting ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0.3;
          }
        }
        @keyframes scale-in {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      {pieces.map((p) => (
        <ConfettiPiece
          key={p.id}
          color={p.color}
          delay={p.delay}
          x={p.x}
          duration={p.duration}
        />
      ))}

      <div
        className="relative flex flex-col items-center rounded-3xl border-2 border-emerald-400/50 bg-white/95 px-10 py-8 shadow-2xl dark:bg-slate-900/95 dark:border-emerald-500/50"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "scale-in 0.4s ease-out" }}
      >
        <div className="pointer-events-none absolute -inset-4 rounded-full bg-emerald-400/20 animate-pulse" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
          <FiCheckCircle className="h-14 w-14" strokeWidth={2.5} />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-slate-100">
          Target completed!
        </h2>
        <p className="mt-2 text-center text-slate-600 dark:text-slate-300">
          You've completed your study target for today. Great job!
        </p>
        <button
          type="button"
          className="btn-primary mt-6"
          onClick={handleClose}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
