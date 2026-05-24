import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStudy } from "../../context/StudyContext";
import FireIcon from "./FireIcon";

function Ember({ delay, x, size }) {
  return (
    <span
      className="streak-ember pointer-events-none absolute rounded-full bg-amber-400"
      style={{
        left: `${x}%`,
        bottom: "35%",
        width: size,
        height: size,
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

export default function StreakFireCelebration() {
  const { shouldShowStreakCelebration, markStreakCelebrationShown, videoStreak } = useStudy();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (shouldShowStreakCelebration) setVisible(true);
  }, [shouldShowStreakCelebration]);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => {
      markStreakCelebrationShown();
      setVisible(false);
      setExiting(false);
    }, 400);
  };

  if (!visible) return null;

  const embers = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    delay: i * 90 + Math.random() * 120,
    x: 15 + Math.random() * 70,
    size: 4 + Math.random() * 6,
  }));

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
        exiting ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      {embers.map((e) => (
        <Ember key={e.id} delay={e.delay} x={e.x} size={e.size} />
      ))}

      <div
        className="streak-celebration-pop relative mx-4 flex max-w-sm flex-col items-center rounded-3xl border border-orange-400/40 bg-linear-to-b from-slate-900 via-slate-900 to-orange-950 px-8 py-10 text-center shadow-2xl shadow-orange-900/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="streak-celebration-glow pointer-events-none absolute -inset-8 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative mb-2">
          <FireIcon size={72} active className="streak-celebration-fire" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-orange-300">Streak secured</p>
        <h2 className="font-display mt-2 text-3xl font-bold text-white">
          {videoStreak} day{videoStreak === 1 ? "" : "s"}!
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          You watched 1 hour of video today. Keep the fire burning tomorrow.
        </p>
        <div className="mt-8 flex w-full flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary flex-1 bg-orange-600 hover:bg-orange-500" onClick={handleClose}>
            Keep studying
          </button>
          <Link
            to="/mission"
            className="btn-secondary flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={handleClose}
          >
            View mission
          </Link>
        </div>
      </div>
    </div>
  );
}
