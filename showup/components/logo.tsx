/**
 * The Showup mark: a rounded square with a soft purple glow in one corner,
 * holding a few lines of shared content with a translucent person standing in
 * front of them (what the webcam overlay does). Inline SVG so it stays sharp and needs no request;
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
      {/* Lines of shared content, and the see-through presenter standing in front of them */}
      <rect x="12" y="25" width="24" height="4" rx="2" fill="#fff" fillOpacity="0.6" />
      <rect x="12" y="34" width="16" height="4" rx="2" fill="#fff" fillOpacity="0.45" />
      <rect x="12" y="43" width="20" height="4" rx="2" fill="#fff" fillOpacity="0.3" />
      <circle cx="50" cy="27" r="8" fill="#e9d5ff" fillOpacity="0.85" />
      <path d="M30 61c0-11 8-19 20-19s20 8 20 19z" fill="#e9d5ff" fillOpacity="0.85" />
    </svg>
  );
}
