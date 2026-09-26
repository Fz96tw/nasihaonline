/**
 * The Showup mark: a rounded square with a soft purple glow in one corner,
 * holding a screen with a translucent person standing in front of it (what the
 * webcam overlay does). Inline SVG so it stays sharp and needs no request;
 * decorative, since the name is written next to it.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden className={className}>
      <defs>
        <radialGradient id="logo-glow" cx="0.85" cy="0.12" r="0.9">
          <stop offset="0" stopColor="#c084fc" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#8800f5" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8800f5" stopOpacity="0" />
        </radialGradient>
        <clipPath id="logo-clip">
          <rect width="80" height="80" rx="20" />
        </clipPath>
      </defs>
      <g clipPath="url(#logo-clip)">
        <rect width="80" height="80" fill="#1b1730" />
        <rect width="80" height="80" fill="url(#logo-glow)" />
      </g>
      <rect x="1.5" y="1.5" width="77" height="77" rx="18.5" stroke="#a855f7" strokeOpacity="0.7" strokeWidth="3" />
      <g transform="translate(0 2)">
        {/* Screen, with a hint of shared content */}
        <rect x="15" y="17" width="50" height="33" rx="5" fill="#fff" fillOpacity="0.08" stroke="#fff" strokeWidth="3" />
        <rect x="21" y="24" width="17" height="3" rx="1.5" fill="#fff" fillOpacity="0.6" />
        <rect x="21" y="30" width="12" height="3" rx="1.5" fill="#fff" fillOpacity="0.4" />
        {/* The see-through presenter */}
        <circle cx="52" cy="32" r="5.5" fill="#e9d5ff" fillOpacity="0.85" />
        <path d="M41 48.5c0-8 5-11.5 11-11.5s11 3.5 11 11.5z" fill="#e9d5ff" fillOpacity="0.85" />
        {/* Stand */}
        <rect x="37" y="50" width="6" height="5" fill="#fff" />
        <rect x="29" y="55" width="22" height="4" rx="2" fill="#fff" />
      </g>
    </svg>
  );
}
