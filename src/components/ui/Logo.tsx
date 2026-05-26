export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <defs>
          {/* Logo gradient — mint palette matching --color-accent.
            * ID kept as `logoGold` so existing path refs don't break. */}
          <linearGradient id="logoGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a8ebe5" />
            <stop offset="50%" stopColor="#4ecdc4" />
            <stop offset="100%" stopColor="#2a8a82" />
          </linearGradient>
          <linearGradient id="logoBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1f2433" />
            <stop offset="100%" stopColor="#11151f" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="7" fill="url(#logoBg)" />
        <circle cx="16" cy="16" r="10" fill="none" stroke="url(#logoGold)" strokeWidth="1.5" />
        <path
          d="M11 11 L16 21 L21 11"
          fill="none"
          stroke="url(#logoGold)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="9" r="2.5" fill="#22c55e" />
      </svg>
      <div className="leading-none">
        <p className="gold-text text-base font-bold tracking-tight">
          Draftboard
        </p>
        <p className="text-[9px] text-white/40 uppercase tracking-widest">
          for League of Legends
        </p>
      </div>
    </div>
  );
}
