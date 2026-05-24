const FireIcon = ({ size = 28, active = false, className = "" }) => (
  <span
    className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
    style={{ width: size, height: size }}
    aria-hidden
  >
    <span
      className={`absolute inset-0 rounded-full blur-md transition-opacity duration-500 ${
        active ? "bg-orange-500/60 opacity-100" : "bg-orange-400/30 opacity-70"
      }`}
    />
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`relative z-10 ${active ? "streak-fire-active" : "streak-fire-idle"}`}
    >
      <defs>
        <linearGradient id="streakFlameOuter" x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="55%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde047" />
        </linearGradient>
        <linearGradient id="streakFlameInner" x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#fef08a" />
        </linearGradient>
      </defs>
      <path
        d="M16 28c-5.5 0-9-4.2-9-8.8 0-2.8 1.2-5.1 2.8-7.2C11.4 10.2 12.2 8.4 12 6.5c0-.2.2-.4.4-.3 1.8 1.4 3.2 3.4 3.6 5.6.4-1.1 1.2-2.1 2.2-2.8 0-.1.2 0 .2.1-.3 2.2.8 4.3 2.1 6.1 1.5 2 2.5 4.1 2.5 6.4C22.8 23.8 19.3 28 16 28z"
        fill="url(#streakFlameOuter)"
      />
      <path
        d="M16 24.5c-3.2 0-5.4-2.5-5.4-5.6 0-1.7.8-3.2 1.7-4.5.7-1 1.2-2.1 1.1-3.2 0-.1.1-.2.2-.1.9.7 1.6 1.8 1.8 3 .2-.7.7-1.3 1.3-1.7 0 0 .1.1.1.2-.2 1.3.5 2.5 1.3 3.5.9 1.2 1.5 2.5 1.5 3.9 0 3.1-2.2 5.5-4.6 5.5z"
        fill="url(#streakFlameInner)"
      />
    </svg>
    {active && (
      <>
        <span className="streak-spark streak-spark-1" />
        <span className="streak-spark streak-spark-2" />
        <span className="streak-spark streak-spark-3" />
      </>
    )}
  </span>
);

export default FireIcon;
